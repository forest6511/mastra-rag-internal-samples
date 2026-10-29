# Aurora PostgreSQL 17.11 と同じ拡張機能のバージョンにそろえる
# pgvector 0.8.2 / pg_bigm 1.2_20250903
# PGroonga は Aurora に無いので使わない
FROM pgvector/pgvector:0.8.2-pg17
ARG PG_BIGM_TAG=v1.2-20250903
ARG BIGM_URL=https://github.com/pgbigm/pg_bigm/archive/refs/tags
ARG BUILD_DEPS="build-essential postgresql-server-dev-17"
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      $BUILD_DEPS curl ca-certificates \
 && curl -fsSL "$BIGM_URL/${PG_BIGM_TAG}.tar.gz" \
      | tar xz -C /tmp \
 && cd /tmp/pg_bigm-* \
 && make USE_PGXS=1 && make USE_PGXS=1 install \
 && apt-get purge -y $BUILD_DEPS \
 && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/* /tmp/pg_bigm-*
