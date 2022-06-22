const assert = require('assert');
const fp = require('fastify-plugin');
const { initTracer, opentracing } = require('jaeger-client');
const url = require('url');

const { Tags, FORMAT_HTTP_HEADERS } = opentracing;

function createSpan(tracer, parentSpan, name, tags) {
  return tracer.startSpan(`${name}()`, {
    childOf: parentSpan.context(),
    tags,
  });
}
function lifeCycleSpan(tracer, request, label) {
  if (request.span) {
    if (request.lifecycleSpan) {
      request.lifecycleSpan.finish();
    }
    request.lifecycleSpan = createSpan(tracer, request.span, label);
  }
}

function handlerDecorator(fn) {
  const fnName = fn.name;
  // return fn;
  return async function decoratedFn(...args) {
    const [request, reply, rest] = args;
    let span = null;
    if (request.span) {
      if (request.lifecycleSpan) {
        request.lifecycleSpan.finish();
      }
      span = createSpan(this.tracer, request.span, `${fnName}()`);
    }
    const output = await fn(request, reply, rest);
    if (span) {
      span.setTag('responseBody', output);
      span.finish();
    }
    return output;
  };
}
function jaegerPlugin(fastify, opts, next) {
  assert(opts.serviceName, 'Jaeger Plugin requires serviceName option');
  const { state = {}, options = {}, ...tracerConfig } = opts;
  const defaultConfig = {
    sampler: {
      type: 'const',
      param: 1,
    },
    reporter: {
      logSpans: false,
    },
  };

  const defaultOptions = {
    logger: fastify.log,
  };

  const tracer = initTracer(
    { ...defaultConfig, ...tracerConfig },
    { ...defaultOptions, ...options },
  );

  function filterObject(obj) {
    const ret = {};
    Object.keys(obj)
      .filter((key) => obj[key] != null)
      .forEach((key) => { ret[key] = obj[key]; });
    return ret;
  }

  function setContext(headers) {
    return filterObject({ ...headers, ...state });
  }

  function onRequest(req, res, done) {
    const parentSpanContext = tracer.extract(FORMAT_HTTP_HEADERS, setContext(req.raw.headers));
    const span = tracer.startSpan(`${req.raw.method} - ${url.format(req.raw.url)}`, {
      childOf: parentSpanContext,
      tags: {
        [Tags.SPAN_KIND]: Tags.SPAN_KIND_RPC_SERVER,
        [Tags.HTTP_METHOD]: req.raw.method,
        [Tags.HTTP_URL]: url.format(req.raw.url),
      },
    });
    req.span = span;
    done();
  }

  function onResponse(req, reply, done) {
    if (req.span) {
      req.span.setTag(Tags.HTTP_STATUS_CODE, reply.statusCode);
      req.span.finish();
    }
    if (req.lifecycleSpan) {
      req.lifecycleSpan.finish();
    }
    done();
  }

  function onError(req, reply, error, done) {
    const { span } = req;
    if (span) {
      span.setTag(Tags.ERROR, {
        'error.object': error,
        message: error.message,
        stack: error.stack,
      });
    }
    done();
  }

  function onClose(instance, done) {
    tracer.close(done);
  }

  fastify.addHook('onRequest', onRequest);
  fastify.addHook('onResponse', onResponse);
  fastify.addHook('onError', onError);
  fastify.addHook('onClose', onClose);
  fastify.addHook('preParsing', (request, _, __, done) => {
    lifeCycleSpan(tracer, request, 'preParsing');
    done();
  });
  fastify.addHook('preValidation', (request, _, done) => {
    lifeCycleSpan(tracer, request, 'preValidation');
    done();
  });
  fastify.addHook('preHandler', (request, _, done) => {
    lifeCycleSpan(tracer, request, 'preHandler');
    done();
  });
  fastify.addHook('preSerialization', (request, _, __, done) => {
    lifeCycleSpan(tracer, request, 'preSerialization');
    done();
  });
  fastify.decorate('tracer', tracer);
  next();
}

module.exports = {
  plugin: fp(jaegerPlugin, { name: 'fastify-jaeger' }),
  handlerDecorator,
};
