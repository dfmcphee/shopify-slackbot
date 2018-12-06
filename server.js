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

function unfurlProduct(product, url) {
  const productMsg = {};
  productMsg[url] = {
    "author_name": "Store Name",
    "fallback": product.title,
    "title": product.title,
    "title_link": url,
    "fields": [
      {
        "title": "Product type",
        "value": product.product_type,
        "short": true
      },
      {
        "title": "Vendor",
        "value": product.vendor,
        "short": true
      }
    ],
    "actions": [
      {
        "type": "button",
        "text": "View product",
        "url": url
      }
    ],
    "image_url": product.image.src,
    "footer": "Store Name"
  };

  return productMsg;
}

function unfurlVariant(variant, url) {
  const variantMsg = {};
  variantMsg[url] = {
    "author_name": "Product Name",
    "fallback": variant.title,
    "title": variant.title,
    "title_link": url,
    "fields": [
      {
        "title": "Inventory",
        "value": variant.inventory_quantity,
        "short": true
      },
    ],
    "actions": [
      {
        "type": "button",
        "text": "View variant",
        "url": url
      }
    ],
    "image_url": variant.image_id,
    "footer": "Store Name"
  };

  return variantMsg;
}

function unfurlOrder(order, url) {
  const orderMsg = {};

  const customerLink = `https://${SHOP_DOMAIN}.myshopify.com/admin/customers/${order.customer.id}`;

  function fulfillmentData(order) {
    if (order.fulfillment_status == null) {
      return ":warning: Unfulfilled";
    } else if (order.fulfillment_status == "partial") {
      return ":warning: Partially fulfilled";
    } else if (order.fulfillment_status == "fulfilled") {
      return ":white_check_mark: Fulfilled";;
    }
  }

  function paymentData(order) {
    if (order.financial_status == "pending") {
      return ":warning: Pending";
    } else if (order.financial_status == "paid") {
      return ":white_check_mark: Paid";
    } else if (order.financial_status == "unpaid") {
      return ":warning: Unpaid";
    } else if (order.financial_status == "partial") {
      return ":warning: Partially paid";
    } 
  }

  function orderNote(order) {
    if (order.note) {
      return {
        title: "Order note",
        value: order.note
      }
    }
  }

  function orderActions(order) {
    actions = [
      {
        "type": "button",
        "text": "View order",
        "url": url
      }
    ];

    if (order.fulfillment_status == "partial" || order.fulfillment_status == null) {
      actions.unshift({
        "type": "button",
        "text": "Fulfill order",
        "style": "primary",
        "url": url
      });
    }
    
    return actions;
  }

  orderMsg[url] = {
    "author_name": `${order.customer.first_name} ${order.customer.last_name}`,
    "author_link": customerLink,
    "fallback": `Order ${order.order_number}`,
    "title": `Order ${order.order_number}`,
    "title_link": url,
    "fields": [
      orderNote(order),
      {
        "title": "Order value",
        "value": `$${order.total_price}`,
        "short": true
      },
      {
        "title": "Line items",
        "value": `${order.line_items.length} items`,
        "short": true
      },
      {
        "title": "Fulfillment status",
        "value": fulfillmentData(order),
        "short": true
      },
      {
        "title": "Payment status",
        "value": paymentData(order),
        "short": true
      }
    ],
    "actions": orderActions(order),
    "footer": "Store Name",
    "ts": (Date.parse(order.created_at)/1000)
  };

  return orderMsg;
}

async function unfurlURL(event, token) {
  const path = url.parse(event.links[0].url).pathname;
  const adminUrl = `https://${PRIVATE_API_KEY}:${PRIVATE_API_SECRET_KEY}@${SHOP_DOMAIN}.myshopify.com${path}.json`;

  const res = await fetch(adminUrl);
  const json = await res.json();

  let message = {};
  const itemUrl = event.links[0].url;

  console.log(json);
  

  if (path.includes("variants")) {
    message = unfurlVariant(json.variant, itemUrl);
  } else if (path.includes("products")) {
    message = unfurlProduct(json.product, itemUrl);
  } else if (path.includes("orders")) {
    message = unfurlOrder(json.order, itemUrl);
  }
  
  const postData = JSON.stringify({
    token: token,
    channel: event.channel,
    ts: event.message_ts,
    unfurls: message
  });

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

