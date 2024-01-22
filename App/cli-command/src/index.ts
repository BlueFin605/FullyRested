import { Command } from "commander"; // add this line
var figlet = require("figlet");
import { RestAction, RestTypeVerb } from "../../shared/runner"
import { CreateEmptyAction } from "../../shared/runner"
import { ExecuteRestAction, IExecuteRestAction } from "../../shared/builder"


//https://blog.logrocket.com/building-typescript-cli-node-js-commander/

const program = new Command();

console.log(figlet.textSync("Rest Easy Runner"));

program
  .version("1.0.0")
  .description("Runner to execute RestEasy actions")
  .option("-c, --collection <value>", "collection file")
  .option("-e, --environment <value>", "select environement in collection")
  .option("-a, --action <value>", "action file")
  .option("-r, --run <value>", "optional run")
  .option("-a, --all <value>", "run all tests, if an action is provided will run all runs for the action")
  .parse(process.argv);

const options = program.opts();

if (options.collection) {
  var action:IExecuteRestAction = ExecuteRestAction.NewExecuteRestAction().setVerb(RestTypeVerb.get);
  console.log(action);
}