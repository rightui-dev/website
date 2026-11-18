import { deploy } from './release/deploy';

deploy().catch(error => {
  console.error(`Deployment stopped: ${error.message}\nFix the reported issue, then run ./deploy again to resume.`);
  process.exitCode = 1;
});
