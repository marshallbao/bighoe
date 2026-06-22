FROM repo.bianjie.ai/node/node:22.17.0-alpine

WORKDIR /app

COPY index.html home.js shared.js students.html students.js seating.html app.js homework.html homework.js grades.html grades.js styles.css server.js README.md ./

ENV HOST=0.0.0.0
ENV PORT=5173

EXPOSE 5173

CMD ["node", "server.js"]
