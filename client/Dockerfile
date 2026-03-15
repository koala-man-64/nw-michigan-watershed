# Use official Nginx image
FROM nginx:alpine

# Set the working directory
WORKDIR /usr/share/nginx/html

# Copy the React build output
COPY build /usr/share/nginx/html

# Copy the custom Nginx configuration
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf

# Azure Static Web Apps terminates TLS upstream; keep the container itself HTTP-only.
EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
