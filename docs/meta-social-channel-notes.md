# Meta Social channel implementation notes

Verified official sources on 2026-09-14:

- Instagram Messaging webhooks: https://developers.facebook.com/documentation/business-messaging/instagram-messaging/webhooks
  - Real-time webhook notifications for Instagram Professional accounts.
  - Required permissions include instagram_basic, instagram_manage_messages, pages_manage_metadata in the referenced webhook documentation.
  - Webhook fields include messages, messaging_postbacks, messaging_seen, messaging_referral, message_reactions, and standby.
  - Payload uses object=instagram, entry[].messaging[].sender.id, recipient.id, message.text and message.is_echo.
- Messenger Platform webhooks: https://developers.facebook.com/documentation/business-messaging/messenger-platform/webhooks
  - HTTPS webhook verification uses hub.mode, hub.verify_token and hub.challenge.
  - Event endpoint must return HTTP 200 within 5 seconds.
  - Page subscription uses pages_manage_metadata and pages_messaging and subscribes the Page to messages.
- Instagram Messaging API send: https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/messaging-api
  - Base host graph.instagram.com; endpoint /<IG_ID>/messages or /me/messages.
  - Text send body: recipient.id (Instagram-scoped ID) and message.text; text is limited to 1000 bytes.
  - Requires Instagram user access token and business messaging permissions.

Implementation direction: keep Instagram and Messenger as official Meta providers, separate from WhatsApp Evolution and WhatsApp Cloud, with server-side secrets, healthcheck, text dispatch, webhook verification, idempotency and handoff reuse.
