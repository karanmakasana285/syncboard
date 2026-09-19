# node:20 (not -alpine) - avoids native-module (bcrypt) compilation issues
# that can arise from alpine's musl libc instead of glibc
FROM node:20

WORKDIR /app

# copy only the dependency manifests first, so Docker can cache this layer
# and skip re-running npm ci on every build unless dependencies actually changed
COPY package.json package-lock.json ./

# npm ci (not npm install) - installs EXACTLY what's in package-lock.json,
# the reproducible, correct choice for a container build
RUN npm ci --omit=dev

# now copy the rest of the actual application code
COPY . .

# Render (and most platforms) set PORT via an environment variable at runtime,
# not at build time - this EXPOSE is documentation for humans/tools, not
# something that actually configures the port itself
EXPOSE 5000

CMD ["node", "server.js"]
