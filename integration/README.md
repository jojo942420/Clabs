# CLabs biomedical device API

The Devices screen is brand-neutral and records manufacturer, model, firmware and serial number. Mindray, Sysmex, Roche, Abbott, Beckman Coulter, Siemens Healthineers, HORIBA, Erba, Ortho Clinical Diagnostics, Bio-Rad, Hologic and generic devices can connect through the supported protocol adapters when the exact device model provides compatible output. Manufacturer selection does not imply a certified model driver. Supported direct formats are normalized JSON and the limited HL7 ORU^R01 profile documented below. HL7's OBR/OBX result structure is described at https://www.hl7.org/fhir/uv/v2mappings/ConceptMap-message-oru-r01-to-bundle.html.

## Automatic gateway setup

1. Under Devices → Configure interface, enter manufacturer and exact model. Select AUTO to detect JSON or HL7, or explicitly choose a protocol. Add observation-code mappings verified against the device manual. No example mappings are activated by default.
2. Save and download `knox-device-config.json` from the one-time connection-key screen. The file contains the device token; protect it like a password and keep it out of source control.
3. Download the local gateway from Devices → API and gateway. On the laboratory gateway computer with Node.js 20+, run `KNOX_CONFIG_FILE=/absolute/path/knox-device-config.json node device-gateway.mjs`. The gateway loads the server configuration automatically. AUTO starts normalized JSON HTTP and HL7 MLLP listeners; the first declared valid connection locks the interface protocol.
4. Configure the machine or vendor middleware to send to the local listener. Defaults: loopback host, MLLP port 2575 and normalized JSON port 8088 at `/messages`. Set GATEWAY_HOST, MLLP_PORT and JSON_PORT to the exact laboratory settings and restrict access by firewall to the intended machine. Cloud hosting cannot discover laboratory LAN or serial hardware.
5. Send a test message with the registered codes and units. Status changes from Awaiting gateway / Awaiting protocol detection / Awaiting test message / Mapping required to Ready for draft import only after contact and matching observations. Gateway connection checks run every minute; contact older than 15 minutes is considered disconnected. Unsupported or mismatched units never cause automatic conversion or release.

Physical device networking, serial parameters, proprietary modes and ASTM transport must be configured using the manufacturer's manual or vendor middleware. ASTM/serial outputs need normalization into the supported formats. This gateway does not download orders to machines, offer automatic LAN discovery or implement universal device drivers. Actual hardware acceptance testing remains necessary.

## Administrator and staff

Sign in with the configured owner username and password. The owner is always an administrator. The Staff accounts page adds staff email addresses and one of admin, scientist, reception or viewer roles. Administrators create individual staff passwords and access privileges. Staff must also be granted access through the private Site's Share controls; an application account does not override the hosting access policy. No invitations are sent automatically.

## Register an instrument

Use Devices → Configure interface. Enter the exact model and firmware, choose JSON or HL7, and map each device observation code to a catalogue test code, exact parameter name and unit. Copy the newly generated interface token into the local gateway's environment. The server stores only its SHA-256 digest. Editing the interface rotates and invalidates the previous token. Disable a profile to reject further messages.

For example, for the RBS template: `GLU` maps to `{ "testId": "RBS", "parameter": "Random plasma glucose", "unit": "mmol/L" }`. Real device codes must be confirmed, not inferred from this example.

## HTTP contract

POST `/api/devices/{interface-id}/messages` (the old `/api/mindray/{interface-id}/messages` route remains compatible).

Headers:
- `Content-Type: application/json`
- `Authorization: Bearer <interface-token>`
- `OAI-Sites-Authorization: <private-site-access-credential>` when dispatch requires a private-site credential. This credential is issued by the hosting platform; an instrument token alone cannot bypass private-site access. Keep it out of source control. Access credential issuance and gateway configuration require the site owner/hosting administrator.

JSON:
```json
{"messageId":"unique-message-001","sampleId":"KDX-accession-ID","results":[{"code":"GLU","value":"5.2","unit":"mmol/L"}]}
```

Values are strings, including detection-limit values such as `<0.1`. Each message has 1–300 observations and a unique message ID per instrument. Identical retries are acknowledged; changed content with an existing ID is rejected. Sample identifiers must match the CLabs order accession or shared request ID before import. No unit conversion is performed.

Response: HTTP 202 `{"accepted":true,"id":"…","status":"pending_review"}`; an identical duplicate receives HTTP 200 with `duplicate:true`. Invalid data is 400/422, bad credentials 401 and conflicting IDs 409. A successful acknowledgement means safely received into the inbox, not clinically reviewed or released.

HL7 profile: send `{"format":"hl7","raw":"MSH|…\rOBR|…\rOBX|…\r"}`. The adapter supports standard separators, one OBR, ORU^R01, and final/corrected NM or ST observations. Unsupported profiles, repeats, escapes and structured numerics are rejected for explicit model-specific normalization. OBR-3 (or OBR-2) supplies the sample identifier. No bidirectional order-download protocol is implemented.

## Local gateway

`device-gateway.mjs` is the recommended brand-neutral Node.js 20+ JSON/MLLP gateway. The older `mindray-gateway.mjs` remains a compatible MLLP-only receiver. Set KNOX_ENDPOINT (the full HTTPS endpoint), KNOX_INTERFACE_TOKEN and KNOX_SITE_ACCESS_TOKEN in the gateway process environment. Set MLLP_HOST to a private network interface and MLLP_PORT to the port specified by your validated analyzer setup; the default host is loopback. Run `node integration/mindray-gateway.mjs` on the laboratory network. Restrict its listener by firewall to the intended instrument. Configure the instrument to retain/retry unacknowledged messages; the gateway acknowledges only after the API confirms storage. It has no durable local spool. ASTM serial/TCP transport, polling protocols and proprietary model formats require a separate validated adapter and are not implemented here.

## Review

Receive the patient sample first. In the instrument inbox, review the result against the matching order, then import to draft. Only empty fields with explicit mappings and exactly matching units can be filled; existing or reviewed results cannot be overwritten. For multi-test messages, import each matching order separately. Inspect and review the draft before printing. Local clinical validation, backups, and device acceptance testing are still required; Hardware compatibility has not been certified by these software tests.

## Gateway APIs

Authenticated device tokens may GET `/api/devices/{id}/configuration` to retrieve the current protocol, mapping and readiness without exposing any credentials. POST `/api/devices/{id}/connect` with `{ "format": "json", "model": "exact registered model" }` (or `hl7`) detects AUTO, verifies the supplied model and updates contact time. Disabled interfaces and invalid tokens are rejected. Readiness is recomputed against the latest received result message. Device tokens cannot edit staff or retrieve workspace records.
