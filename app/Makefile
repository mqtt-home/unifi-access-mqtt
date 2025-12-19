# Makefile for Go application

# Set the Go binary and flags
GO = go
GOFLAGS = -v

# Set the paths
BUILD_DIR = build
CONFIG_DIR = $(PWD)/../production/config

# Set the binary name
BINARY_NAME = unifi-access-mqtt
DOCKER_IMAGE_NAME = pharndt/unifi-access-mqtt:latest

.PHONY: build
build: build-backend

.PHONY: build-backend
build-backend:
	@echo "Building the backend..."
	@$(GO) build $(GOFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME) .

.PHONY: dev-backend
dev-backend: build-backend
	@echo "Starting backend dev server..."
	@$(BUILD_DIR)/$(BINARY_NAME) $(CONFIG_DIR)/config.json

.PHONY: run
run: build
	@echo "Running the application..."
	@$(BUILD_DIR)/$(BINARY_NAME) $(CONFIG_DIR)/config.json

.PHONY: docker
docker: build
	@echo "Building Docker image..."
	@docker build -t $(DOCKER_IMAGE_NAME) .

.PHONY: clean
clean:
	@echo "Cleaning up..."
	@rm -rf $(BUILD_DIR)

.PHONY: test
test:
	@echo "Running tests..."
	@$(GO) test -v ./...
