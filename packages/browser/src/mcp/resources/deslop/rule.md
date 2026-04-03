---
name: deslop
description: Simplify and refine recently modified code while preserving functionality. Use when asked to "deslop", "clean up code", "simplify code", or after making changes that could benefit from refinement.
version: 1.0.0
---

# Code Simplification

## Checklist

### Preserve Functionality

- [ ] Never change what the code does — only how it does it
- [ ] All original features, outputs, and behaviors remain intact

### Apply Project Standards

- [ ] ES modules with proper import sorting and extensions
- [ ] Explicit return type annotations for top-level functions
- [ ] Proper component patterns with explicit Props types
- [ ] Proper error handling patterns (avoid try/catch when possible)
- [ ] Consistent naming conventions

### Enhance Clarity

- [ ] Reduce unnecessary complexity and nesting
- [ ] Eliminate redundant code and abstractions
- [ ] Improve variable and function names for readability
- [ ] Consolidate related logic
- [ ] Remove obvious/redundant comments
- [ ] No nested ternary operators — use switch or if/else
- [ ] Choose clarity over brevity — explicit over compact

### Maintain Balance

- [ ] Don't reduce clarity or maintainability
- [ ] Don't create overly clever solutions
- [ ] Don't combine too many concerns into single functions
- [ ] Don't remove helpful abstractions
- [ ] Don't prioritize fewer lines over readability
- [ ] Don't make code harder to debug or extend

### Focus Scope

- [ ] Only refine recently modified code unless instructed otherwise

### Process

- [ ] Identify recently modified sections
- [ ] Analyze for elegance and consistency improvements
- [ ] Apply project-specific best practices
- [ ] Verify functionality unchanged
- [ ] Confirm result is simpler and more maintainable
