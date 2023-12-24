const { Command } = require("commander"); // add this line
const figlet = require("figlet");

//https://blog.logrocket.com/building-typescript-cli-node-js-commander/

const program = new Command();

console.log(figlet.textSync("Rest Easy Runner"));

program
  .version("1.0.0")
  .description("Runner to execute RestEasy actions")
  .option("-c, --collection  <value>", "collection file")
  .option("-a, --action <value>", "action file")
  .option("-r, --run <value>", "optional run")
  .option("-a, --all <value>", "run all tests, if an action is provided will run all runs for the action")
  .parse(process.argv);

const options = program.opts();