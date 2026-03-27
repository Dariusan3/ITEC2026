FROM node:20-slim
WORKDIR /sandbox
COPY code.js .
CMD ["node", "code.js"]
