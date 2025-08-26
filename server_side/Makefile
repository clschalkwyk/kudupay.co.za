# Makefile to streamline Chalice workflows for this project
# Usage examples:
#   make help
#   make deploy            # deploy to dev (default stage)
#   make deploy STAGE=prod # deploy to a different stage
#   make logs              # view logs for current stage
#   make tail              # follow logs
#   make local             # run chalice local on PORT (default 8000)
#   make url               # print API URL for current stage
#   make delete            # delete deployed app for current stage
#   make package           # create a deployment package in .build/<stage>
#   make install           # install chalice and project requirements

# Configuration
APP_DIR := kuduq-consumer
STAGE ?= dev
PORT ?= 8000
BUILD_DIR := .build/$(STAGE)

# Tools
PY ?= python3
PIP := $(PY) -m pip
CHALICE := chalice

# Internal
CHALICE_IN := cd $(APP_DIR) && 

.PHONY: help deploy delete logs tail local url status info package install clean build-dir

help:
	@echo "Available targets:"
	@echo "  help           - Show this help"
	@echo "  deploy         - chalice deploy --stage $(STAGE)"
	@echo "  delete         - chalice delete --stage $(STAGE)"
	@echo "  logs           - chalice logs --stage $(STAGE)"
	@echo "  tail           - chalice logs --stage $(STAGE) --follow"
	@echo "  local          - chalice local --port $(PORT)"
	@echo "  url            - chalice url --stage $(STAGE)"
	@echo "  status/info    - chalice status --stage $(STAGE)"
	@echo "  package        - chalice package --stage $(STAGE) $(BUILD_DIR)"
	@echo "  install        - pip install chalice and project requirements"
	@echo "Variables: STAGE=$(STAGE) PORT=$(PORT) APP_DIR=$(APP_DIR)"

# Deploy to AWS for the selected STAGE
deploy:
	@$(CHALICE_IN) $(CHALICE) deploy --stage $(STAGE)

# Delete the deployed app for the selected STAGE
delete:
	@$(CHALICE_IN) $(CHALICE) delete --stage $(STAGE)

# View logs for the selected STAGE
logs:
	@$(CHALICE_IN) $(CHALICE) logs --stage $(STAGE)

# Follow logs for the selected STAGE
tail:
	@$(CHALICE_IN) $(CHALICE) logs --stage $(STAGE) --follow

# Run the app locally
local:
	@$(CHALICE_IN) $(CHALICE) local --port $(PORT)

# Print the API Gateway URL for the selected STAGE
url:
	@$(CHALICE_IN) $(CHALICE) url --stage $(STAGE)

# Show Chalice status for the selected STAGE
status info:
	@$(CHALICE_IN) $(CHALICE) status --stage $(STAGE)

# Package the application into the build folder for CI/CD use
package: build-dir
	@$(CHALICE_IN) $(CHALICE) package --stage $(STAGE) ../$(BUILD_DIR)
	@echo "Package created in $(BUILD_DIR)"

# Ensure build directory exists
build-dir:
	@mkdir -p $(BUILD_DIR)

# Install chalice and project dependencies into the current environment
install:
	@$(PIP) install --upgrade pip
	@$(PIP) install chalice
	@$(PIP) install -r $(APP_DIR)/requirements.txt

# Clean build artifacts
clean:
	@rm -rf .build
	@find $(APP_DIR)/.chalice -maxdepth 1 -name "deployments" -type d -exec rm -rf {} + 2>/dev/null || true
