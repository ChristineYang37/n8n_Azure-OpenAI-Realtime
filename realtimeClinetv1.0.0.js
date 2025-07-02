#!/usr/bin/env node

// realtimeClient.js
// Node.js WebSocket client for Azure OpenAI Realtime Chat
// Usage example:
// node realtimeClient.js --endpoint=https://<resource>.cognitiveservices.azure.com \
//     --apiKey=<YOUR_API_KEY> \
//     --deployment=gpt-4o-mini-realtime-preview \
//     --callbackUrl=https://<your-n8n-domain>/webhook/receive-realtime

import WebSocket from 'ws';
import { argv } from 'process';
import https from 'https';
import http from 'http';

// Simple argument parsing
const args = {};
argv.slice(2).forEach(arg => {
  const [key, val] = arg.split('=');
  const name = key.replace(/^--/, '');
  args[name] = val;
});

const {
  endpoint,
  apiKey,
  deployment,
  callbackUrl
} = args;

if (!endpoint || !apiKey || !deployment || !callbackUrl) {
  console.error('Usage: node realtimeClient.js --endpoint=<URL> --apiKey=<KEY> --deployment=<NAME> --callbackUrl=<URL>');
  process.exit(1);
}

(async () => {
  try {
    // 1. 建立 Realtime Session
    const sessionUrl = `${endpoint}/openai/realtime/chat/sessions?api-version=2024-10-01-preview&deployment=${deployment}`;
    const sessionResp = await fetch(sessionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey
      },
      body: JSON.stringify({ model: deployment })
    });
    if (!sessionResp.ok) {
      throw new Error(`Session request failed: ${sessionResp.status} ${await sessionResp.text()}`);
    }
    const sessionData = await sessionResp.json();
    const token = sessionData.sessionToken;
    const wssUri = sessionData.websocketUri ||
      `${endpoint.replace(/^http/, 'ws')}/openai/realtime?sessionToken=${token}&deployment=${deployment}`;

    // 2. 連線到 WebSocket
    const ws = new WebSocket(wssUri, {
      headers: { 'api-key': apiKey }
    });

    ws.on('open', () => {
      console.log('WebSocket 已連線');
      // 啟動對話流，例如送第一條訊息
      // ws.send(JSON.stringify({ type: 'conversation.item.create', text: 'Hello' }));
    });

    ws.on('message', async (data) => {
      let msg;
      try { msg = JSON.parse(data.toString()); } catch {
        return;
      }
      if (msg.type === 'conversation.item') {
        const text = msg.text;
        const timestamp = Date.now();
        console.log('[AI]', text);
        // 3. 推回 n8n Webhook
        try {
          await fetch(callbackUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, timestamp })
          });
        } catch (err) {
          console.error('回呼推送失敗', err);
        }
      }
    });

    ws.on('error', (err) => console.error('WebSocket 錯誤', err));
    ws.on('close', (code, reason) => console.log(`WebSocket 已關閉: ${code} ${reason}`));

  } catch (err) {
    console.error('執行失敗', err);
    process.exit(1);
  }
})();
