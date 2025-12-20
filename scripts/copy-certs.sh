#!/bin/bash

# UniFi Access - Copy MQTT Certificates from Cloud Gateway
#
# This script copies the MQTT client certificates from the UniFi Cloud Gateway
# to your local machine. These certificates can be used to connect directly
# to the UniFi Access Hub's MQTT broker.
#
# Prerequisites:
#   - SSH root access to the Cloud Gateway
#   - The Cloud Gateway must be running UniFi Access
#
# Usage: ./copy-certs.sh <cloud-gateway-ip> [output-directory]
#
# Example: ./copy-certs.sh 192.168.1.1 ./certs

set -e

GATEWAY_IP="${1}"
OUTPUT_DIR="${2:-./certs}"

if [ -z "$GATEWAY_IP" ]; then
    echo "Usage: $0 <cloud-gateway-ip> [output-directory]"
    echo ""
    echo "Example: $0 192.168.1.1 ./certs"
    exit 1
fi

# Certificate paths on the Cloud Gateway
REMOTE_CERT_DIR="/data/unifi-access/ws/certs"

echo "UniFi Access MQTT Certificate Downloader"
echo "========================================="
echo ""
echo "Cloud Gateway: ${GATEWAY_IP}"
echo "Output directory: ${OUTPUT_DIR}"
echo ""

# Create output directory
mkdir -p "${OUTPUT_DIR}"

# Copy all certificates at once
echo "Copying certificates (you may be prompted for password)..."
echo ""
scp -o BatchMode=no \
    "root@${GATEWAY_IP}:${REMOTE_CERT_DIR}/*.pem" \
    "${OUTPUT_DIR}/"

echo ""
echo "Certificates copied successfully!"
echo ""

# Verify certificates
echo "Verifying certificates..."
for cert in ca-cert.pem mqtt-client-cert.pem mqtt-client-priv.pem; do
    if [ -f "${OUTPUT_DIR}/${cert}" ]; then
        size=$(wc -c < "${OUTPUT_DIR}/${cert}")
        echo "  - ${cert}: ${size} bytes"
    else
        echo "  - ${cert}: MISSING!"
    fi
done

echo ""
echo "Certificate details:"
echo "-------------------"
openssl x509 -in "${OUTPUT_DIR}/ca-cert.pem" -noout -subject -issuer 2>/dev/null || echo "Could not parse CA cert"
echo ""
openssl x509 -in "${OUTPUT_DIR}/mqtt-client-cert.pem" -noout -subject -issuer 2>/dev/null || echo "Could not parse client cert"

echo ""
echo "Next steps:"
echo "  1. Find your Hub's IP address"
echo "  2. Test MQTT connection with:"
echo "     mosquitto_sub -h <hub-ip> -p 8883 \\"
echo "       --cafile ${OUTPUT_DIR}/ca-cert.pem \\"
echo "       --cert ${OUTPUT_DIR}/mqtt-client-cert.pem \\"
echo "       --key ${OUTPUT_DIR}/mqtt-client-priv.pem \\"
echo "       -t '#' -v"
echo ""
