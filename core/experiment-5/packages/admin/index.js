const express = require('express');
const vm = require('vm');
const ReactDOMServer = require('react-dom/server');
const React = require('react');
const rateLimit = require('express-rate-limit');

const app = express();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

const cached_plugins = new Map();
installed_plugins = ['plugin1', 'plugin2'];

app.get('/favicon.ico', (req, res) => {
  res.send('');
});

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link rel="shortcut icon" href="#">
      <title>Module Links</title>
    </head>
    <body>
      <h1>WebCrumbs</h1>
      <h3>Unlock, extend and customize your website</h3>
      <p>Think of this as the admin panel we've been working on at the admin folder. Soon enough, you'll be able to load and import plugins in a snap. Just one click and boom, they're in! Right now, this page is here to show you that it's entirely possible to load plugins dynamically from remote addresses. For the time being, we're running things off localhost on different ports, but down the road, keep an eye out for plugins loading from https://registry.webcrumbs.org/.</p>
      <p>Choose a plugin to dynamically load from a remote source with server-side-rendering:</p>
      ${installed_plugins.map(pluginName => `<button onclick="window.location.href='/${pluginName}'">${pluginName} (Port 3001)</button>`).join('')}
    </body>
    </html>
  `);
});


async function fetchPlugin(pluginName) {
  if (cached_plugins.has(pluginName)) {
    return cached_plugins.get(pluginName);
  }
  const fetch = (await import('node-fetch')).default;

  const server_response = await fetch(`http://localhost:3001/plugins/${pluginName}/server`);
  if (!server_response.ok) {
    throw new Error(`HTTP error! status: ${server_response.status}`);
  }
  const server = await server_response.text();

  const client_response = await fetch(`http://localhost:3001/plugins/${pluginName}/client`);
  if (!client_response.ok) {
    throw new Error(`HTTP error! status: ${client_response.status}`);
  }
  const client = await client_response.text();

  const pluginCode = { server, client };
  cached_plugins.set(pluginName, pluginCode);
  return pluginCode;
}

app.get('/:pluginName', async (req, res) => {
  const { pluginName } = req.params;

  try {
    const pluginCode = await fetchPlugin(pluginName);

    const sandbox = {
      require: require,
      console: console,
      process: process,
      React: React,
      ReactDOMServer: ReactDOMServer,
      module: {},
      exports: { default: {} }
    };

    vm.createContext(sandbox);
    vm.runInNewContext(pluginCode.server, sandbox);
    const Plugin = sandbox.exports.default;
    const pluginServer = ReactDOMServer.renderToString(React.createElement(Plugin, { env: 'server'}));
    const pluginClient = pluginCode.client;
    
    res.status(200).send(`
      <!DOCTYPE html>
      <html>
      <head>
      <title>Plugin example: ${pluginName}</title>
      <link rel="shortcut icon" href="#">
      </head>
      <body>
        <h1>WebCrumbs</h1>
        <h3>Plugin example: ${pluginName}</h3>
        <div id="root">${pluginServer}</div>
        <script>${pluginClient}</script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error(error);
    res.status(500).send('An error occurred while fetching the module');
  }
});

app.get('/plugins/:pluginName/:env', async (req, res) => {
  const { pluginName, env } = req.params;
  const response = await fetchPlugin(pluginName);
  res.setHeader('Content-Type', 'application/javascript');
  res.send(response[env]);
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Admin Panel Server is running on http://localhost:${PORT}/`);
});