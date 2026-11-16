# Java Exception Handling

## Table of Contents

- [Prefer Unchecked Exceptions](#prefer-unchecked-exceptions)
- [4 Exception Handling Patterns Senior Developers Use](#4-exception-handling-patterns-senior-developers-use)
- [The Mental Model That Changes Everything](#the-mental-model-that-changes-everything)
- [Summary: Complete Exception Handling Strategy](#summary-complete-exception-handling-strategy)

## Prefer Unchecked Exceptions

### Core Principles

1. **Use unchecked exceptions** (RuntimeException) for most error handling
2. **Avoid checked exceptions** - they create maintenance burden and scalability issues
3. **Separate normal flow from error handling** - exceptions improve readability over return value checking

### When to Use Each Exception Type

#### Use Unchecked Exceptions (RuntimeException) when:
- Error is due to programming fault (NullPointerException, IllegalArgumentException)
- Error is from faulty input (NumberFormatException)
- Program cannot meaningfully recover: The caller cannot fix it
- Example: DB schema broken, network down
- **This should be your default choice**

#### Use Checked Exceptions only when:
- Programmer cannot prevent the error at coding time
- Program can take meaningful recovery action (retry, fallback, user notification)
- Example: file not found → try another path

### Problems with Checked Exceptions

#### 1. Poor Scalability
- Changes to exception signatures cascade through entire call stack
- Replacing libraries forces signature updates across codebase
- Creates unnecessary refactoring burden

#### 2. Unnecessary Dependencies
- Every method in call chain must know about exception class
- Unchecked exceptions only need dependency at throw site and catch site
- Intermediate methods shouldn't need exception knowledge

#### 3. Lambda Incompatibility
- Checked exceptions break method references in streams
- Require verbose try-catch blocks inside lambdas
- Force wrapping in RuntimeException or returning default values

#### 4. Compiler Overhead
- Forces handling even when exception is impossible (validated input, hardcoded values)
- Reduces test coverage (untestable catch blocks)
- Creates "useless" code just to satisfy compiler

### Anti-Patterns to Avoid

```java
// ❌ BAD: Catch-all exception
try {
    // code
} catch (Exception e) {
    // catches everything
}

// ❌ BAD: Empty catch block
try {
    URL url = new URL("malformed");
} catch (MalformedURLException e) {}

// ❌ BAD: Print and continue
try {
    // code
} catch (Exception ex) {
    ex.printStackTrace();
}
```

### Best Practices

#### Wrap Checked Exceptions
```java
// ✅ GOOD: Wrap in unchecked exception with chaining

public class UserRepositoryException extends RuntimeException {

    public UserRepositoryException(String message, Throwable cause) {
        super(message, cause);
    }
}

@Repository
public class UserRepository {

    @PersistenceContext
    private EntityManager em;

    public User findById(String id) {
        try {
            return em.find(User.class, id);

        } catch (PersistenceException e) {
            // JPA-level exception (implementation detail)
            throw new UserRepositoryException(
                "Failed to load user with id=" + id, e
            );
        }
    }
}
```

#### Exception Chaining
- Always pass original exception to preserve stack trace
- Pattern: `new MyException("message", originalException)`
- Used by Spring and Hibernate frameworks

#### Performance Note
- No performance difference between checked/unchecked (compile-time only)
- Stack trace generation is expensive - disable if performance-critical

### Framework Examples

- **Spring Framework**: Wraps checked exceptions (like JDBC) into unchecked exceptions
- **Hibernate**: Moved from checked to unchecked exceptions
- Both use exception chaining to preserve original context

---

## 4 Exception Handling Patterns Senior Developers Use

### Pattern 1: Validate First, Catch Never

The most common reason junior devs add try-catch is to handle invalid input. A null value comes in, something breaks, and the catch block saves the day.

**The Problem:**

```java
// ❌ WRONG — Catching what validation should have prevented
@PostMapping("/users")
public ResponseEntity<User> createUser(@RequestBody UserRequest request) {
    try {
        User user = userService.create(request);
        return ResponseEntity.ok(user);
    } catch (NullPointerException e) {
        return ResponseEntity.badRequest().body(null);
    } catch (IllegalArgumentException e) {
        return ResponseEntity.badRequest().body(null);
    }
}
```

**What Senior Devs Do:**

```java
// ✅ CORRECT - Validate at the door. Nothing bad gets inside.
@PostMapping("/users")
public ResponseEntity<User> createUser(@Valid @RequestBody UserRequest request) {
    User user = userService.create(request);
    return ResponseEntity.status(HttpStatus.CREATED).body(user);
}

// The request object itself enforces the rules
public class UserRequest {
    @NotBlank(message = "Name is required")
    private String name;
    
    @Email(message = "Must be a valid email")
    @NotNull(message = "Email is required")
    private String email;
    
    @Min(value = 18, message = "Must be at least 18")
    private int age;
}
```

**The Rule:** If you're catching an exception caused by bad input, you have a validation problem — not an exception handling problem.

### Pattern 2: Custom Exception Hierarchy

Junior devs catch `Exception`. Senior devs build a hierarchy that makes every failure self-explanatory.

**The Problem:**

```java
// ❌ WRONG — Generic exceptions tell you nothing
try {
    orderService.process(order);
} catch (Exception e) {
    logger.error("Something failed: " + e.getMessage());
    return ResponseEntity.internalServerError().build();
}
```

**What Senior Devs Do:**

```java
// ✅ CORRECT - A structured exception hierarchy

// Base exception - all app exceptions extend this (uses RuntimeException - unchecked)
public class AppException extends RuntimeException {
    private final HttpStatus status;
    private final String errorCode;
    
    public AppException(String message, HttpStatus status, String errorCode) {
        super(message);
        this.status = status;
        this.errorCode = errorCode;
    }
    
    public HttpStatus getStatus() { return status; }
    public String getErrorCode() { return errorCode; }
}

// Specific exceptions speak for themselves
public class NotFoundException extends AppException {
    public NotFoundException(String resource, Long id) {
        super(
            resource + " not found with id: " + id, 
            HttpStatus.NOT_FOUND, 
            "NOT_FOUND"
        );
    }
}

public class BusinessRuleViolatedException extends AppException {
    public BusinessRuleViolatedException(String rule) {
        super(
            "Business rule violated: " + rule, 
            HttpStatus.CONFLICT, 
            "BUSINESS_RULE_VIOLATED"
        );
    }
}

// Usage - no try-catch needed in the service
public Order processOrder(OrderRequest request) {
    Order order = orderRepository.findById(request.getOrderId())
        .orElseThrow(() -> new NotFoundException("Order", request.getOrderId()));
        
    if (order.isAlreadyProcessed()) {
        throw new BusinessRuleViolatedException("Order already processed");
    }
    
    return orderRepository.save(order);
}
```

When `NotFoundException` gets thrown, you already know what failed, why it failed, and what HTTP status to return. Zero guesswork.

**The Rule:** If you're catching a generic exception and then trying to figure out what actually went wrong, your exceptions aren't specific enough.

**Note:** This pattern aligns with our core principle of using unchecked exceptions (RuntimeException). All custom exceptions extend RuntimeException, avoiding the problems of checked exceptions.

### Pattern 3: @ControllerAdvice — Handle Exceptions in One Place

Junior devs put try-catch in every controller method. Senior devs handle all exceptions in a single, centralized place.

**The Problem:**

```java
// ❌ WRONG — Copy-pasting the same catch logic across 15 controllers
@GetMapping("/orders/{id}")
public ResponseEntity<Order> getOrder(@PathVariable Long id) {
    try {
        return ResponseEntity.ok(orderService.findById(id));
    } catch (NotFoundException e) {
        return ResponseEntity.notFound().build();
    } catch (Exception e) {
        return ResponseEntity.internalServerError().build();
    }
}
```

**What Senior Devs Do:**

```java
// ✅ CORRECT - One handler. All controllers. Zero duplication.
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(NotFoundException.class)
    public ResponseEntity<ErrorResponse> handleNotFound(NotFoundException e) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
            .body(new ErrorResponse(e.getErrorCode(), e.getMessage()));
    }

    @ExceptionHandler(BusinessRuleViolatedException.class)
    public ResponseEntity<ErrorResponse> handleBusinessRule(
            BusinessRuleViolatedException e) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
            .body(new ErrorResponse(e.getErrorCode(), e.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidation(
            MethodArgumentNotValidException e) {
        String details = e.getBindingResult().getFieldErrors().stream()
            .map(error -> error.getField() + ": " + error.getDefaultMessage())
            .collect(Collectors.joining(", "));
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
            .body(new ErrorResponse("VALIDATION_FAILED", details));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleUnexpected(Exception e) {
        logger.error("Unexpected error", e);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
            .body(new ErrorResponse("INTERNAL_ERROR", "Something went wrong"));
    }
}

// Error response DTO
public class ErrorResponse {
    private String errorCode;
    private String message;
    private LocalDateTime timestamp;
    
    public ErrorResponse(String errorCode, String message) {
        this.errorCode = errorCode;
        this.message = message;
        this.timestamp = LocalDateTime.now();
    }
    
    // getters
}

// Now your controllers look like THIS
@GetMapping("/orders/{id}")
public Order getOrder(@PathVariable Long id) {
    return orderService.findById(id);  // Exceptions handle themselves
}
```

Your controllers become clean. Thin. Readable. All the error logic lives in one file.

**The Rule:** If you're writing the same catch block in more than one controller, you need a `@ControllerAdvice`.

### Pattern 4: Result Objects for Expected Failures

Not every failure is exceptional. "User not found" isn't an error — it's a normal outcome. Using exceptions for normal outcomes is like using an ambulance to get to work.

**The Problem:**

```java
// ❌ WRONG — Throwing exceptions for expected scenarios
public User findUser(Long id) {
    return userRepository.findById(id)
        .orElseThrow(() -> new NotFoundException("User", id));
}

// Now every caller needs to handle this exception
```

**What Senior Devs Do:**

```java
// ✅ CORRECT - Result objects communicate success and failure explicitly
public class Result<T> {
    private final T value;
    private final String error;
    private final boolean success;
    
    private Result(T value, String error, boolean success) {
        this.value = value;
        this.error = error;
        this.success = success;
    }

    public static <T> Result<T> ok(T value) {
        return new Result<>(value, null, true);
    }

    public static <T> Result<T> failure(String error) {
        return new Result<>(null, error, false);
    }

    public boolean isSuccess() { return success; }
    public T getValue() { return value; }
    public String getError() { return error; }
}

// Usage - no exceptions, no guessing
public Result<User> findUser(Long id) {
    return userRepository.findById(id)
        .map(Result::ok)
        .orElse(Result.failure("User not found with id: " + id));
}

// Caller knows exactly what happened
Result<User> result = userService.findUser(123L);
if (result.isSuccess()) {
    return ResponseEntity.ok(result.getValue());
}
return ResponseEntity.notFound().build();
```

**Alternative:** Use Java's `Optional<T>` for simple cases where you only need to represent presence/absence:

```java
// For simple cases - use Optional
public Optional<User> findUser(Long id) {
    return userRepository.findById(id);
}

// Caller
return userService.findUser(123L)
    .map(ResponseEntity::ok)
    .orElse(ResponseEntity.notFound().build());
```

**The Rule:** If a scenario is expected — not a bug, not a system failure — don't throw an exception. Return a Result or Optional.

---

## The Mental Model That Changes Everything

Senior developers think about exceptions in two categories:

### Exceptional (Use Exceptions)
Something that should **not** happen under normal conditions:
- A database connection drops
- A third-party API times out
- The server runs out of memory
- File system permissions denied
- Network failures

**These deserve:** try-catch, logging, alerts, and unchecked exceptions (RuntimeException)

### Expected (Use Validation or Result Objects)
Something that **can** happen as part of normal business logic:
- A user doesn't exist
- An order has already shipped
- A payment is declined
- Invalid input data
- Business rule violations

**These deserve:** validation, Result objects, Optional, and clean control flow — not try-catch

### Decision Tree

```
Is this a programming error (bug)?
├─ YES → Use IllegalArgumentException, IllegalStateException (unchecked)
└─ NO → Is this expected in normal business flow?
    ├─ YES → Use validation, Result<T>, or Optional<T>
    └─ NO → Is it a recoverable system failure?
        ├─ YES → Use custom unchecked exception (extends RuntimeException)
        └─ NO → Let it bubble up or use @ControllerAdvice
```

Once you start categorizing failures this way, you'll naturally write fewer try-catch blocks. Not because you're ignoring errors. Because you're handling them better.

---

## Summary: Complete Exception Handling Strategy

1. **Default to unchecked exceptions** (RuntimeException) - avoid checked exceptions
2. **Validate first** - prevent invalid input from reaching business logic
3. **Build a custom exception hierarchy** - make failures self-explanatory
4. **Use @ControllerAdvice** - centralize exception handling in Spring applications
5. **Use Result/Optional for expected scenarios** - not everything needs an exception
6. **Wrap checked exceptions** - when you must use them, wrap with exception chaining
7. **Never use empty catch blocks** - always handle or log
8. **Throw early, catch late** - let exceptions propagate to proper handling points


