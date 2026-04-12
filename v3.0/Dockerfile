# ============================================================
# Sketch My Home - 2D Architectural Floor Plan Designer
# Static site served via Nginx (legacy engine)
# ============================================================

FROM nginx:1.27-alpine

LABEL maintainer="sketch my home"
LABEL description="Professional 2D Architectural Floor Plan Designer"
LABEL version="2.1.0"

# Remove default Nginx welcome page
RUN rm -rf /usr/share/nginx/html/*

# --- Copy the main entry HTML (use legacy version as the standalone app) ---
COPY index.legacy.html   /usr/share/nginx/html/index.html

# --- Copy all JS/CSS from the legacy folder (the actual running engine) ---
COPY legacy/style.css          /usr/share/nginx/html/style.css
COPY legacy/app.legacy.js      /usr/share/nginx/html/app.js
COPY legacy/canvas-engine.js   /usr/share/nginx/html/canvas-engine.js
COPY legacy/tools.js           /usr/share/nginx/html/tools.js
COPY legacy/elements.js        /usr/share/nginx/html/elements.js
COPY legacy/event-bus.js       /usr/share/nginx/html/event-bus.js
COPY legacy/crypto.js          /usr/share/nginx/html/crypto.js
COPY legacy/auth.js            /usr/share/nginx/html/auth.js
COPY legacy/api-client.js       /usr/share/nginx/html/api-client.js
COPY legacy/branding-assets.js /usr/share/nginx/html/branding-assets.js

# --- Copy branding assets and other public files to root ---
# index.html expects logo.png in the same directory
COPY public/*                  /usr/share/nginx/html/

# --- Custom Nginx config: SPA fallback + gzip compression ---
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
