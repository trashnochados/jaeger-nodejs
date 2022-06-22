start:
	podman run --rm -it --pod dev-stack --name test-service -v "$(PWD)":/usr/src/app/ trashnochados/nodejs:raw-node16 yarn start:dev
