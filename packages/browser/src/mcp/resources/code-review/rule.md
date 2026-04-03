---
name: code-review
description: Perform code reviews. Use when reviewing pull requests, examining code changes, or providing feedback on code quality. Covers security, performance, testing, and design review.
---

# Code Review

## Checklist

### Identifying Problems

- [ ] No runtime errors: exceptions, null pointers, out-of-bounds access
- [ ] No unbounded O(n²) operations, N+1 queries, or unnecessary allocations
- [ ] No unintended side effects affecting other components
- [ ] No breaking API changes without migration path
- [ ] No complex ORM queries with unexpected performance
- [ ] No security vulnerabilities: injection, XSS, access control gaps, secrets exposure

### Design Assessment

- [ ] Component interactions make logical sense
- [ ] Change aligns with existing project architecture
- [ ] No conflicts with current requirements or goals

### Test Coverage

- [ ] Functional tests for business logic
- [ ] Integration tests for component interactions
- [ ] End-to-end tests for critical user paths
- [ ] Tests cover actual requirements and edge cases
- [ ] No excessive branching or looping in test code

### Long-Term Impact

- [ ] Flag for senior review: DB schema changes, API contract changes, new frameworks, perf-critical paths, security-sensitive code

### Feedback

- [ ] Be polite and empathetic; provide actionable suggestions
- [ ] Phrase as questions when uncertain: "Have you considered...?"
- [ ] Approve when only minor issues remain — don't block for style
- [ ] Goal is risk reduction, not perfect code
