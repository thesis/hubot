import * as fs from 'fs';
import { resolve } from 'path';
import optparse from 'optparse';
import { loadBot } from '../index.esm.js';
import 'emittery';
import 'coffeescript';
import 'node:module';
import 'url';
import 'async';
import 'log';
import 'scoped-http-client';
import 'util';

const {
  OptionParser
} = optparse;
const switches = [["-a", "--adapter ADAPTER", "The Adapter to use"], ["-c", "--create PATH", "Create a deployable hubot"], ["-d", "--disable-httpd", "Disable the HTTP server"], ["-h", "--help", "Display the help information"], ["-l", "--alias ALIAS", "Enable replacing the robot's name with alias"], ["-n", "--name NAME", "The name of the robot in chat"], ["-r", "--require PATH", "Alternative scripts path"], ["-t", "--config-check", "Test hubot's config to make sure it won't fail at startup"], ["-v", "--version", "Displays the version of hubot installed"]];
const options = {
  adapter: process.env.HUBOT_ADAPTER || "shell",
  alias: process.env.HUBOT_ALIAS,
  create: process.env.HUBOT_CREATE || false,
  enableHttpd: process.env.HUBOT_HTTPD !== undefined ? /*#__PURE__*/["0", "false"].includes( /*#__PURE__*/process.env.HUBOT_HTTPD.toLowerCase()) : true,
  scripts: [],
  name: process.env.HUBOT_NAME || "Hubot",
  path: process.env.HUBOT_PATH || ".",
  configCheck: false,
  version: undefined
};
const Parser = /*#__PURE__*/new OptionParser(switches);
Parser.banner = "Usage hubot [options]";
Parser.on("adapter", (opt, value) => {
  options.adapter = value;
});
Parser.on("create", (opt, value) => {
  options.path = value;
  options.create = true;
});
Parser.on("disable-httpd", opt => {
  options.enableHttpd = false;
});
Parser.on("help", () => {
  console.log(Parser.toString());
  return process.exit(0);
});
Parser.on("alias", (opt, value) => {
  if (!value) {
    value = "/";
  }
  options.alias = value;
});
Parser.on("name", (opt, value) => {
  options.name = value;
});
Parser.on("require", (opt, value) => {
  options.scripts.push(value);
});
Parser.on("config-check", opt => {
  options.configCheck = true;
});
Parser.on("version", (opt, value) => {
  options.version = true;
});
Parser.on((opt, value) => {
  console.warn(`Unknown option: ${opt}`);
});
Parser.parse(process.argv);
if (process.platform !== "win32") {
  process.on("SIGTERM", () => process.exit(0));
}
if (options.create) {
  console.error("'hubot --create' is deprecated. Use the yeoman generator instead:");
  console.error("    npm install -g yo generator-hubot");
  console.error(`    mkdir -p ${options.path}`);
  console.error(`    cd ${options.path}`);
  console.error("    yo hubot");
  console.error("See https://github.com/github/hubot/blob/master/docs/index.md for more details on getting started.");
  process.exit(1);
}
const robot = /*#__PURE__*/loadBot(undefined, options.adapter, options.enableHttpd, options.name, options.alias);
if (options.version) {
  console.log(robot.version);
  process.exit(0);
}
if (options.configCheck) {
  loadScripts();
  console.log("OK");
  process.exit(0);
}
robot.once("adapter-initialized", () => robot.run());
robot.once("connected", loadScripts);
function loadExternalScripts() {
  const externalScripts = resolve(".", "external-scripts.json");
  if (!fs.existsSync(externalScripts)) {
    return;
  }
  fs.readFile(externalScripts, {
    encoding: "utf8"
  }, async (error, data) => {
    if (error) {
      throw error;
    }
    try {
      await robot.loadExternalScripts(JSON.parse(data));
    } catch (loadingError) {
      console.error(`Error parsing JSON data from external-scripts.json: ${loadingError}`);
      process.exit(1);
    }
  });
}
function loadScripts() {
  robot.load(resolve(".", "scripts"));
  robot.load(resolve(".", "src", "scripts"));
  loadExternalScripts();
  options.scripts.forEach(scriptPath => {
    if (scriptPath[0] === "/") {
      return robot.load(scriptPath);
    }
    robot.load(resolve(".", scriptPath));
  });
}
//# sourceMappingURL=hubot.esm.js.map
