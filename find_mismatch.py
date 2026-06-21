import sys

def find_mismatch(filename):
    with open(filename, 'r') as f:
        content = f.read()
    
    depth_p = 0
    depth_b = 0
    i = 0
    line = 1
    col = 1
    
    while i < len(content):
        char = content[i]
        
        if content[i:i+2] == "//":
            i = content.find("\n", i)
            if i == -1: break
            line += 1
            col = 1
            continue
        elif content[i:i+2] == "/*":
            end = content.find("*/", i)
            if end == -1: break
            skipped = content[i:end+2]
            line += skipped.count("\n")
            i = end + 2
            col = 1 # approximate
            continue
        elif char in ['"', "'", '`']:
            quote = char
            i += 1
            while i < len(content):
                if content[i] == "\\":
                    i += 2
                elif content[i] == quote:
                    i += 1
                    break
                else:
                    if content[i] == "\n":
                        line += 1
                        col = 1
                    i += 1
            continue
        
        if char == '(': depth_p += 1
        elif char == ')': depth_p -= 1
        elif char == '{': depth_b += 1
        elif char == '}': depth_b -= 1
        
        if char == "\n":
            line += 1
            col = 1
        else:
            col += 1
            
        if depth_p < 0:
            print(f"Negative paren depth at line {line}, col {col}")
        if depth_b < 0:
            print(f"Negative brace depth at line {line}, col {col}")
        
        i += 1
        
    print(f"Final depths: Braces={depth_b}, Parens={depth_p}")

if __name__ == "__main__":
    find_mismatch(sys.argv[1])
