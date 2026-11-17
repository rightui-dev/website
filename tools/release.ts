import { main } from './release/main';

main().catch(error => { console.error(`Release stopped: ${error.message}`); process.exitCode = 1; });
