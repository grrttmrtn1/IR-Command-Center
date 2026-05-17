FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libmagic1 \
    libxml2-dev \
    libxslt1-dev \
    xmlsec1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /var/uploads

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

CMD ["/entrypoint.sh"]
