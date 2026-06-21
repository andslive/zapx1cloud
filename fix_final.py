import re

def remove_strings_and_comments(code):
    code = re.sub(r'//.*', '', code)
    code = re.sub(r'/\*.*?\*/', '', code, flags=re.DOTALL)
    code = re.sub(r'"(?:\\.|[^"\\])*"', '', code)
    code = re.sub(r"'(?:\\.|[^'\\])*'", '', code)
    code = re.sub(r"`(?:\\.|[^`\\])*`", '', code)
    return code

with open('supabase/functions/uazapi-webhook/index.ts', 'r') as f:
    lines = f.readlines()

# We know Deno.serve starts at a certain line. 
# We want to make sure the stack is empty right before it.
serve_line_idx = -1
for i, line in enumerate(lines):
    if 'Deno.serve' in line:
        serve_line_idx = i
        break

if serve_line_idx != -1:
    stack = []
    for i in range(serve_line_idx):
        clean = remove_strings_and_comments(lines[i])
        for char in clean:
            if char == '{': stack.append(i)
            elif char == '}':
                if stack: stack.pop()
    
    if stack:
        print(f"Braces unclosed before Deno.serve: {stack}")
        # Insert missing closing braces before Deno.serve
        for _ in range(len(stack)):
            lines.insert(serve_line_idx, "}\n")
            serve_line_idx += 1

# Now fix the serve block balance
stack = []
for i in range(serve_line_idx, len(lines)):
    clean = remove_strings_and_comments(lines[i])
    for char in clean:
        if char == '{': stack.append(i)
        elif char == '}':
            if stack: stack.pop()
            else:
                # Extra brace in serve block
                lines[i] = "// removed extra brace\n"

if stack:
    for _ in range(len(stack)):
        lines.append("}\n")

with open('supabase/functions/uazapi-webhook/index.ts', 'w') as f:
    f.writelines(lines)
