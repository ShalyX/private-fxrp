# Self-contained build of tee-proxy. Clones tee-proxy from GitHub at build time
# so no local sibling repos are needed.
#
# TEE_PROXY_COMMIT must match the commit suffix encoded in the tee-proxy
# pseudo-version in tools/go.mod. Pinning a commit keeps the required develop
# build immutable; cloning the moving develop branch would not be reproducible.

ARG TEE_PROXY_COMMIT=0c6d016b09948cba9a508ba357e592eb6088fd1c

# NOTE: not pinned by digest (unlike the main Dockerfile) — this is a dev convenience build.
# For full reproducibility, pin by digest: golang:1.25.1-alpine@sha256:...
FROM golang:1.25.8-alpine AS builder

RUN apk add --no-cache git

ARG TEE_PROXY_COMMIT

WORKDIR /app
RUN git clone --filter=blob:none https://github.com/flare-foundation/tee-proxy.git && \
    cd tee-proxy && \
    git checkout --detach "${TEE_PROXY_COMMIT}"

WORKDIR /app/tee-proxy
RUN go mod download
RUN CGO_ENABLED=0 GOOS=linux go build -a -o main ./cmd/proxy

# Final stage
FROM alpine:3.21

WORKDIR /app

COPY --from=builder /app/tee-proxy/main .
COPY --from=builder /app/tee-proxy/config/config.example.toml ./config/config.toml

RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup

RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 6661
EXPOSE 6662

CMD ["./main"]
