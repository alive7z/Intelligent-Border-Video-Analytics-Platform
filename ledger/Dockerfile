FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /ledger
COPY ledger.py .
COPY docker-entrypoint.sh .

RUN groupadd -g 10002 ledger \
  && useradd -u 10002 -g ledger -m -s /usr/sbin/nologin ledger \
  && mkdir -p /ledger/data/BOP /ledger/data/Sector-HQ /ledger/data/Command-Centre \
  && chmod +x /ledger/docker-entrypoint.sh \
  && chown -R ledger:ledger /ledger

USER ledger

EXPOSE 8541 8542 8543

ENTRYPOINT ["/ledger/docker-entrypoint.sh"]
