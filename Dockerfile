# Use an official Node.js runtime as a parent image
FROM node:18-alpine

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the source code
COPY . .

# Build the React app
RUN npm run build

# Install serve to run the production build
RUN npm install -g serve

# Expose only port 443
EXPOSE 443

# Command to run the built app on port 443
CMD ["sh", "-c", "PORT=443 serve -s build"]
