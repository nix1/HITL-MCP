# JSONata Rule Builder

The JSONata Rule Builder is a visual tool available at `http://localhost:3737/jsonata-rule-builder.html` that allows you to create advanced data transformation rules without having to manually write complex JSONata syntax.

## What is JSONata?
JSONata is a query and transformation language for JSON data. In the HITL-MCP project, it is used in **Proxy** mode to modify requests and responses "on the fly."

## What is the Rule Builder for?
It allows you to:
- **Select a field for transformation**: e.g., message content (`messages[].content`).
- **Set conditions**: e.g., "change only if the sender is `user`".
- **Define actions**: e.g., "replace text using Regex" or "append a system instruction".
- **Testing**: You can paste sample JSON and immediately see the transformation result.

## How to use a generated rule?
1. Configure the transformation in the Builder.
2. Copy the generated JSONata expression.
3. Paste it into the Proxy rules configuration ("Proxy Rules" tab in the web interface).

This allows you to, for example, automatically remove sensitive data from logs or force the model into a specific response format without changing the extension's code.
