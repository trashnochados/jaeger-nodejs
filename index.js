// Require the framework and instantiate it
const fastify = require('fastify')({ logger: true })


// fastify.register(require('./opentracing'), {
//   serviceName: 'my-service-name'
// })
const { plugin: jaegerPlugin, handlerDecorator: handlerDecorator } = require('./lib/opentracing');
fastify.register(jaegerPlugin, {
  serviceName: 'user-service',
  config: {
    serviceName: 'ping-server',
    sampler: {
      type: 'const',
      param: 1
    },
    reporter: {
      logSpans: true
    }
  },
  options: {
    tags: {
      "versions": process.versions,
      "service-version": "2.0.0",
    },
  }
})


// Declare a route
function getHello(request, reply) {
  return ({ hello: 'world' })
}
const newGet = handlerDecorator(getHello);
fastify.route({
  method: 'GET',
  url: '/hello',
  schema: {
    response: {
      200: {
        type: 'object',
        properties: {
          hello: { type: 'string' }
        }
      }
    }
  },
  handler: newGet
});
fastify.route({
  method: 'POST',
  url: '/hello',
  schema: {
    response: {
      200: {
        type: 'object',
        properties: {
          hello: { type: 'string' }
        }
      }
    }
  },
  handler: handlerDecorator(function postHello(request, reply) {
    return ({ hello: 'world' })
  }),
});

// Run the server!
const start = async () => {
  try {
    await fastify.listen({host:'0.0.0.0', port: 3100 })
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}
start()
