# Guide: Convert GitHub Copilot to an OpenAI-Compatible API

## Introduction

This guide explains how to use GitHub Copilot through an API compatible with OpenAI's format. You can either use direct `curl` commands or the provided automation scripts.

## Manual API Usage (Advanced)

## Prerequisites

- GitHub account with active Copilot subscription
- Terminal/shell access

## About the Client ID

The `client_id` used in this guide (`Iv1.b507a08c87ecfe98`) is GitHub Copilot's **public application identifier**. This is the same for all users - you don't need to obtain your own. It's hardcoded in official Copilot extensions and is safe to use.

## Step 1: Get Your Copilot Token

Run these commands in sequence:

### 1. Request device code:

```bash
curl -X POST 'https://github.com/login/device/code' \
-H 'accept: application/json' \
-H 'editor-version: Neovim/0.6.1' \
-H 'editor-plugin-version: copilot.vim/1.16.0' \
-H 'content-type: application/json' \
-H 'user-agent: GithubCopilot/1.155.0' \
--compressed \
-d '{"client_id":"Iv1.b507a08c87ecfe98","scope":"read:user"}'
```

**Response explanation:**

- `device_code`: Unique identifier for this authentication session
- `user_code`: 8-character code (XXXX-XXXX format) to enter on GitHub
- `verification_uri`: URL where you'll authorize the device
- `expires_in`: Time in seconds before the codes expire (usually 15 minutes)
- `interval`: Minimum seconds to wait between polling attempts

### 2. Authorize your device:

1. Visit the `verification_uri` from the response
2. Log in with your GitHub account if prompted
3. Enter the `user_code` (format: XXXX-XXXX)
4. Confirm authorization for the device

You should see a success message indicating the device is authorized

### 3. Get access token (run repeatedly until success):

Replace `YOUR_DEVICE_CODE` with the `device_code` from past step response. This will generate the access token needed for the next step.

```bash
curl -X POST 'https://github.com/login/oauth/access_token' \
-H 'accept: application/json' \
-H 'content-type: application/json' \
--compressed \
-d '{"client_id":"Iv1.b507a08c87ecfe98","device_code":"YOUR_DEVICE_CODE","grant_type":"urn:ietf:params:oauth:grant-type:device_code"}'
```

### 4. Retrieve final Copilot token:

Replace `YOUR_ACCESS_TOKEN` with the `token` from past step response:

```bash
curl -X GET 'https://api.github.com/copilot_internal/v2/token' \
-H 'authorization: token YOUR_ACCESS_TOKEN' \
--compressed
```

The response includes additional information, but we only need the `token` field.

## Step 2: Make API Requests

### Required Headers

For all Copilot API requests, you need these two essential headers:

- `authorization: Bearer YOUR_COPILOT_TOKEN` - Authentication with the token from step 4
- `Copilot-Integration-Id: vscode-chat` - Identifies the integration type

### Completions Endpoint

```bash
curl -X POST 'https://api.githubcopilot.com/chat/completions' \
-H 'authorization: Bearer YOUR_COPILOT_TOKEN' \
-H 'Copilot-Integration-Id: vscode-chat' \
-H 'content-type: application/json' \
-d '{
  "messages": [
    {
      "role": "user",
      "content": "Write a Python function to calculate the factorial of a number"
    }
  ],
  "max_tokens": 1000,
  "temperature": 0.3,
  "stream": false
}'
```

**Streaming Support**: Add `"stream": true` to the request body if you want real-time response streaming.

### Models Endpoint

Get available Copilot models:

```bash
curl -X GET 'https://api.githubcopilot.com/models' \
-H 'authorization: Bearer YOUR_COPILOT_TOKEN' \
-H 'Copilot-Integration-Id: vscode-chat'
```

## Response Handling

Example response from completions endpoint:

```json
{
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "def factorial(n):\n    if n == 0 or n == 1:\n        return 1\n    else:\n        return n * factorial(n - 1)"
      },
      "index": 0,
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 15,
    "completion_tokens": 45,
    "total_tokens": 60
  }
}
```

Example response from models endpoint:

```json
{
  "data": [
    {
      "id": "gpt-4o",
      "object": "model",
      "created": 1234567890,
      "owned_by": "github-copilot"
    }
  ]
}
```

## Important Notes

✔ **Token Management**:

- Tokens expire after 25 minutes
- Regenerate tokens as needed

✔ **Rate Limits**:

- GitHub may throttle excessive requests
- Suggested: 1 request every 2 seconds

✔ **Legal Considerations**:

- Uses unofficial GitHub endpoints
- May violate Copilot Terms of Service
- Not recommended for production use

## Troubleshooting

🔧 **Common Issues**:

- `401 Unauthorized`: Token expired - regenerate
- `403 Forbidden`: Check token permissions
- `429 Too Many Requests`: Reduce call frequency
