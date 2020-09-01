import { spawn as pty } from "node-pty-prebuilt-multiarch";
import { Command } from "commander";
import { homedir } from "os";
import { join as p } from "path";
import { stat, mkdir, writeFile, access, readFile } from "fs/promises";

const envshelldir = p(homedir(), ".envshell");
const envshellconf = p(homedir(), ".envshell/conf.json");

export default async () => {
  const path = process.cwd();
  await setupConfFolder();
  const conf = await loadConf();
  const environ = getEnviron(conf, path);

  const envshell = new Command("envshell");
  envshell
    .action(startShell(environ))
    .description(
      "Start a shell with configured variables loaded into the environment"
    );
  envshell
    .command("set <variable> <value>")
    .description("Add or modify a new variable in the environment")
    .action(setEnvVar(conf, environ, path));

  envshell
    .command("clear <variable>")
    .description("Clear a variable in the environment")
    .action(clearEnvVar(conf, environ, path));

  envshell
    .command("list")
    .description("List variables in this environment")
    .action(listEnvVar(environ));

  envshell.parse();
};

export const setupConfFolder = async () => {
  try {
    const dirstat = await stat(envshelldir);
    if (dirstat.isDirectory()) {
    } else {
      console.log(`Cannot open directory ${envshelldir}`);
    }
  } catch {
    mkdir(envshelldir, { recursive: true });
    console.log(`Created directory ${envshelldir}`);
  }
  try {
    await access(envshellconf);
  } catch {
    writeFile(envshellconf, JSON.stringify({}), { encoding: "utf-8" });
    console.log(`Created file ${envshellconf}`);
  }
};

export const getEnviron = (conf, path) => {
  const environ = conf[path];
  if (environ === undefined) {
    return {};
  } else {
    return environ;
  }
};

export const loadConf = async (): Promise<Object> => {
  try {
    const confData = await readFile(envshellconf);
    return JSON.parse(confData.toString("utf-8"));
  } catch {
    console.log(`Error reading from ${envshellconf}`);
    process.exit();
  }
};

export const startShell = (environ) => () => {
  if (process.env.envshell === "true") {
    console.log("You are already in an envshell...");
    process.exit();
  }
  process.stdout.write("\n");
  process.stdout.write(
    "*********************************************************\n"
  );
  process.stdout.write(
    "* Entered Envshell, activating environment variables... *\n"
  );
  process.stdout.write(
    "*********************************************************\n"
  );
  process.stdout.write("\n");
  process.stdin.setRawMode(true);
  const proc = pty("powershell.exe", [], {
    cols: process.stdout.columns,
    rows: process.stdout.rows,
    env: { ...process.env, ...environ, envshell: "true" },
  });
  process.stdout.on("resize", () => {
    proc.resize(process.stdout.columns, process.stdout.rows);
  });
  proc.onData((data) => {
    process.stdout.write(data);
  });
  process.stdin.on("data", (data) => {
    proc.write(data.toString("utf-8"));
  });
  proc.on("exit", () => {
    process.stdout.write("\n");
    process.stdout.write(
      "***********************************************************\n"
    );
    process.stdout.write(
      "* Leaving Envshell, decativating environment variables... *\n"
    );
    process.stdout.write(
      "***********************************************************\n"
    );
    process.stdout.write("\n");
    process.exit();
  });
};

export const setEnvVar = (conf, env, path) => async (variable, value) => {
  conf[path] = { ...env, [variable]: value };
  try {
    await writeFile(envshellconf, JSON.stringify(conf), { encoding: "utf-8" });
    console.log(`Saved ${variable}:${value}`);
  } catch {
    console.log(`Failed to save ${variable}:${value}`);
  } finally {
    process.exit();
  }
};

export const listEnvVar = (env) => () => {
  if (Object.keys(env).length === 0) {
    console.log("No variables set in this environment");
  } else {
    console.table(env);
  }
  process.exit();
};
export const clearEnvVar = (conf, env, path) => async (variable) => {
  if (env[variable] === undefined) {
    console.log(`The variable ${variable} is not set`);
    process.exit();
  }
  delete env[variable];
  conf[path] = env;
  try {
    await writeFile(envshellconf, JSON.stringify(conf), "utf-8");
    console.log(`Removed variable ${variable} from the environment`);
  } catch {
    console.log(`Failed to remove variable ${variable} from the environment`);
  } finally {
    process.exit();
  }
};
