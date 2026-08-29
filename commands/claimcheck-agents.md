---
description: List the coding agents claimcheck can measure, and what has actually been verified
---

Show the user which agents claimcheck can drive.

1. Call the `list_agent_profiles` MCP tool.

2. Present a compact table: agent name, the CLI command it drives, the policies
   it defines, and whether it is verified.

3. For any profile where `verified` is false, say what is unverified — quote the
   `verificationNote`. An unverified profile can still run, but a failure may be
   a wrong CLI flag rather than the agent getting the answer wrong, and that
   distinction changes what a result means.

4. Mention that a new agent is added by writing one profile JSON file, not by
   changing claimcheck's code, and point at
   `docs/integrations.md` plus the "Writing an agent profile" section of the
   README if they want to add one.
