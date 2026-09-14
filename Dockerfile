FROM node:20-alpine

WORKDIR /app

# Set timezone to Asia/Kolkata for IST schedule
RUN apk add --no-cache tzdata
ENV TZ=Asia/Kolkata

COPY package*.json ./
RUN npm install

COPY . .

CMD ["npm", "run", "worker"]
