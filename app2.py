from fastmcp import FastMCP

mcp = FastMCP("Simple MCP")

@mcp.tool
def add(a: int, b: int) -> int:
    """Add two numbers"""
    return a + b

@mcp.tool
def greet(name: str) -> str:
    """Greet someone by name"""
    return f"Hello, {name}!"

if __name__ == "__main__":
    mcp.run(transport="http", host="0.0.0.0", port=9000)