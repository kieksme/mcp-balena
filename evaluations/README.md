# Read-only tool evaluations

`fixtures.json` defines a small, fixed Balena account. `questions.xml` contains ten independent questions with exact answers. Each question requires joining at least two resources through the MCP read tools. Use these cases to assess whether an MCP client chooses and composes the tools correctly; the values are deliberately synthetic and require no Balena credentials.

The fixture is a model of Balena v7 resources, not a live account or a secret-bearing API recording. Functional unit tests in `test/` verify actual request construction, authentication, and transports.
