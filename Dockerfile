# ============================================================
# sketch my home - 2D Architectural Floor Plan Designer
# Static site served via Nginx
# ============================================================

FROM nginx:1.27-alpine

LABEL maintainer="sketch my home"
LABEL description="Professional 2D Architectural Floor Plan Designer"
LABEL version="2.0.0"

# Remove default Nginx welcome page
RUN rm -rf /usr/share/nginx/html/*

# Copy all static assets into Nginx's web root
COPY index.html         /usr/share/nginx/html/
COPY style.css          /usr/share/nginx/html/
COPY app.js             /usr/share/nginx/html/
COPY canvas-engine.js   /usr/share/nginx/html/
COPY tools.js           /usr/share/nginx/html/
COPY elements.js        /usr/share/nginx/html/
COPY event-bus.js       /usr/share/nginx/html/
COPY crypto.js          /usr/share/nginx/html/
COPY branding-assets.js /usr/share/nginx/html/
COPY logo.png           /usr/share/nginx/html/

# Copy sub-directories
COPY components/        /usr/share/nginx/html/components/
COPY lib/               /usr/share/nginx/html/lib/
COPY utils/             /usr/share/nginx/html/utils/
COPY app/               /usr/share/nginx/html/app/

# Custom Nginx config: SPA fallback + gzip compression
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
