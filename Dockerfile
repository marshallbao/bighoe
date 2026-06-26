FROM repo.bianjie.ai/node/node:22.17.0-alpine AS deps

WORKDIR /app
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.ustc.edu.cn/g' /etc/apk/repositories
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM repo.bianjie.ai/node/node:22.17.0-alpine AS runtime

WORKDIR /app

RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.ustc.edu.cn/g' /etc/apk/repositories
RUN apk add --no-cache libstdc++ su-exec

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=5173
ENV BIGHOE_API_KEY=
ENV BIGHOE_DB_PATH=/data/bighoe.db

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node server.js app.js shared.js home.js students.js seating.html students.html index.html login.html ./
COPY --chown=node:node homework.js homework.html homework-analysis.js homework-analysis.html ./
COPY --chown=node:node grades.js grades.html styles.css ./
COPY --chown=node:node assets ./assets

EXPOSE 5173

CMD ["npm", "start"]
