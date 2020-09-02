import { spawn as pty } from "node-pty-prebuilt-multiarch";
import { Command } from "commander";
import { homedir } from "os";
import { join as p, sep } from "path";
import { stat, mkdir, writeFile, access, readFile } from "fs/promises";

const envshelldir = p(homedir(), ".envshell");
const envshellconf = p(homedir(), ".envshell/conf.json");

interface Configuration {
  [x: string]: NodeJS.ProcessEnv | undefined;
}

type Environs = Array<{ path: string; env?: NodeJS.ProcessEnv }>;

export default async () => {
  const path = process.cwd();
  await setupConfFolder();
  const conf = await loadConf();
  const env = getEnviron(conf, path);

  const envshell = new Command("envshell");
  envshell
    .action(startShell(env))
    .description(
      "Start a shell with configured variables loaded into the environment"
    );
  envshell
    .command("set <variable> <value>")
    .description("Add or modify a new variable in the environment")
    .action(setEnvVar(conf, path));

  envshell
    .command("clear <variable>")
    .description("Clear a variable in the environment")
    .action(clearEnvVar(conf, path));

  envshell
    .command("list")
    .description("List variables in this environment")
    .action(listEnvVar(env));

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

export const getEnviron = (conf: Configuration, path: string): Environs => {
  const pathParts = path.split(sep);
  return recurse(conf, pathParts);
};

const recurse = (conf: Configuration, pathParts: string[]): Environs => {
  const path = pathParts.join(sep);
  const environ = conf[path];
  pathParts.pop();
  if (pathParts.length === 1) {
    return [{ env: environ, path: path }];
  } else {
    const out = recurse(conf, pathParts).concat([{ env: environ, path: path }]);
    return out;
  }
};

export const loadConf = async (): Promise<Configuration> => {
  try {
    const confData = await readFile(envshellconf);
    return JSON.parse(confData.toString("utf-8"));
  } catch {
    console.log(`Error reading from ${envshellconf}`);
    process.exit();
  }
};

export const startShell = (env: Environs) => () => {
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

  const mergeEnv = env
    .map((i) => i.env)
    .reduce((prev, curr) => {
      return { ...prev, ...curr };
    }, {});
  displayEnvVars(env);
  process.stdin.setRawMode(true);
  const proc = pty("powershell.exe", [], {
    cols: process.stdout.columns,
    rows: process.stdout.rows,
    env: { ...process.env, ...mergeEnv, envshell: "true" },
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

export const setEnvVar = (conf: Configuration, path: string) => async (
  variable: string,
  value: string
) => {
  let trueValue;
  if (value === "-") {
    trueValue = await getValue();
  } else {
    trueValue = value;
  }
  conf[path] = { ...conf[path], [variable]: trueValue };
  try {
    await writeFile(envshellconf, JSON.stringify(conf), { encoding: "utf-8" });
    console.log(`Saved ${variable}:${trueValue}`);
  } catch {
    console.log(`Failed to save ${variable}:${trueValue}`);
  } finally {
    process.exit();
  }
};

export const listEnvVar = (env: Environs) => () => {
  displayEnvVars(env);
  process.exit();
};

const displayEnvVars = (envs: Environs) => {
  envs.forEach((item) => {
    const env = item.env;
    if (env !== undefined) {
      console.log(item.path);
      console.log("-------------");
      Object.keys(env).forEach((key) => {
        console.log(`${key} : ${env[key]}`);
      });
      console.log();
    }
  });
};

export const clearEnvVar = (conf: Configuration, path: string) => async (
  variable: string
) => {
  const subConf = conf[path];
  if (subConf === undefined) {
    console.log(`The environemnt ${path} has no variables set`);
    process.exit();
  }
  if (subConf[variable] === undefined) {
    console.log(`The variable ${variable} is not set`);
    process.exit();
  }
  delete subConf[variable];
  try {
    await writeFile(envshellconf, JSON.stringify(conf), "utf-8");
    console.log(`Removed variable ${variable} from the environment`);
  } catch {
    console.log(`Failed to remove variable ${variable} from the environment`);
  } finally {
    process.exit();
  }
};

const getValue = () =>
  new Promise<string>((res, rej) => {
    let value = "";
    process.stdin.on("data", (data) => {
      value += data.toString("utf-8");
    });
    process.stdin.on("end", () => {
      res(value);
    });
    process.stdin.on("error", (err) => {
      rej(err);
    });
  });
