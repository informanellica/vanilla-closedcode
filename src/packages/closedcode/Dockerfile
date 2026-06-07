FROM alpine AS base

RUN apk add libgcc libstdc++ ripgrep

FROM base AS build-amd64
COPY dist/closedcode-linux-x64-baseline-musl/bin/closedcode /usr/local/bin/closedcode

FROM base AS build-arm64
COPY dist/closedcode-linux-arm64-musl/bin/closedcode /usr/local/bin/closedcode

ARG TARGETARCH
FROM build-${TARGETARCH}
RUN closedcode --version
ENTRYPOINT ["closedcode"]
