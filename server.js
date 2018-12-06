const Koa = require('koa');
const next = require('next');
const Router = require('koa-router');
const bodyParser = require('koa-bodyparser');
const fetch = require('node-fetch');
const url = require('url');
const { default: createShopifyAuth } = require('@shopify/koa-shopify-auth');
const dotenv = require('dotenv');
const { verifyRequest } = require('@shopify/koa-shopify-auth');
const session = require('koa-session');
require('isomorphic-fetch');

const port = parseInt(process.env.PORT, 10) || 3000;
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

dotenv.config();
const { SHOPIFY_API_SECRET_KEY, SHOPIFY_API_KEY, SHOP_DOMAIN, SLACK_TOKEN, PRIVATE_API_KEY, PRIVATE_API_SECRET_KEY, } = process.env;

async function unfurlURL(event, token) {
  const path = url.parse(event.links[0].url).pathname;
  const adminUrl = `https://${PRIVATE_API_KEY}:${PRIVATE_API_SECRET_KEY}@${SHOP_DOMAIN}.myshopify.com${path}.json`;

  const res = await fetch(adminUrl);
  const json = await res.json();

  console.log(json);

  const productMsg = {};
  productMsg[event.links[0].url] = {
      "author_icon": "http://flickr.com/icons/bobby.jpg",
      "fallback": json.product.title,
      "title": json.product.title,
      "title_link": "https://api.slack.com/",
      "fields": [
          {
              "title": "Total",
              "value": "$100.23",
              "short": true
          },
          {
              "title": "Items",
              "value": "4",
              "short": true
          }
      ],
      "actions": [
          {
              "type": "button",
              "text": "Start fulfilling",
              "url": "https://flights.example.com/book/r123456",
              "style": "primary"
          },
          {
              "type": "button",
              "text": "View order",
              "url": "https://requests.example.com/cancel/r123456"
          }
      ],
      "image_url": "http://my-website.com/path/to/image.jpg",
      "thumb_url": "http://example.com/path/to/thumb.png",
      "footer": "Store Name"
    };

  const postData = JSON.stringify({
    token: token,
    channel: event.channel,
    ts: event.message_ts,
    unfurls: productMsg
  });

  console.log(postData);

  const headers = {
    Authorization: `Bearer ${SLACK_TOKEN}`,
    "Content-Type": "application/json;charset=UTF-8"
  };

  const slackRes = await fetch("https://slack.com/api/chat.unfurl", {
    method: "POST",
    body: postData,
    headers
  });
  const slackJson = await slackRes.json();

  console.log(slackJson);
}

app.prepare().then(() => {
  const server = new Koa();
  const router = new Router();
  server.use(session(server));
  server.use(bodyParser());
  server.keys = [SHOPIFY_API_SECRET_KEY];

  router.get('*', async (ctx) => {
    await handle(ctx.req, ctx.res);
    ctx.respond = false;
  });

  router.post('/', (ctx, next) => {
    console.log(ctx.request.body);
    if (ctx.request.body.type === 'url_verification') {
      ctx.body = ctx.request.body.challenge;
    } else if (ctx.request.body.event) {
      const { event, token } = ctx.request.body;
  
      unfurlURL(event, token);
  
      ctx.body = 'ok';
    } else {
      ctx.body = 'Not found.';
    }
  });

  server.use(async (ctx, next) => {
    ctx.res.statusCode = 200;
    await next();
  });

  server.use(
    createShopifyAuth({
      apiKey: SHOPIFY_API_KEY,
      secret: SHOPIFY_API_SECRET_KEY,
      scopes: ['read_products'],
      afterAuth(ctx) {
        const { shop, accessToken } = ctx.session;

        ctx.redirect('/');
      },
    }),
  );

  server.use(router.routes());
  server.use(verifyRequest());

  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});

