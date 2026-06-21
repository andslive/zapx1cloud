import sys

def count_braces(filename):
    with open(filename, 'r') as f:
        content = f.read()
    
    # Remove strings and comments to get accurate count
    # (Simple version, might not handle all edge cases but usually enough)
    clean_content = ""
    i = 0
    while i < len(content):
        if content[i:i+2] == "//":
            i = content.find("\n", i)
            if i == -1: break
        elif content[i:i+2] == "/*":
            i = content.find("*/", i) + 2
            if i == 1: break # not found
        elif content[i] in ['"', "'", '`']:
            quote = content[i]
            i += 1
            while i < len(content):
                if content[i] == "\\": i += 2
                elif content[i] == quote:
                    i += 1
                    break
                else: i += 1
        else:
            clean_content += content[i]
            i += 1
            
    open_b = clean_content.count('{')
    close_b = clean_content.count('}')
    open_p = clean_content.count('(')
    close_p = clean_content.count(')')
    
    print(f"Braces: {{: {open_b}, }}: {close_b}, Diff: {open_b - close_b}")
    print(f"Parens: (: {open_p}, ): {close_p}, Diff: {open_p - close_p}")

if __name__ == "__main__":
    count_braces(sys.argv[1])
