# Java DTO Patterns
Source : https://blog.scottlogic.com/2020/01/03/rethinking-the-java-dto.html 

## Overview

DTOs (Data Transfer Objects) are server-side value objects that store data using the presentation layer representation. They decouple presentation and domain layers.

## Good DTO Characteristics

- **Consistent syntax**: Same parameter names behave identically across endpoints
- **Consistent semantics**: Documentation and validation inherited uniformly
- **Minimal boilerplate**: Easy to write and maintain
- **Readable**: Structure visible at a glance

## Recommended Pattern: Interface-Based DTOs

### Structure

```java
public enum ProductDTO {;
    interface Id { @Positive Long getId(); }
    interface Name { @NotBlank String getName(); }
    interface Price { @Positive Double getPrice(); }
    interface Cost { @Positive Double getCost(); }

    public enum Request {;
        @Value public static class Create implements Name, Price, Cost {
            String name;
            Double price;
            Double cost;
        }
    }

    public enum Response {;
        @Value public static class Public implements Id, Name, Price {
            Long id;
            String name;
            Double price;
        }

        @Value public static class Private implements Id, Name, Price, Cost {
            Long id;
            String name;
            Double price;
            Double cost;
        }
    }
}
```

### Key Concepts

1. **One file per controller** containing all related DTOs
2. **Empty enums as namespaces** - enables `ProductDTO.Request.Create` syntax
3. **One interface per parameter** - single source of truth for validation/docs
4. **Lombok `@Value`** - auto-generates getters that satisfy interfaces

### Benefits

| Benefit | Description |
|---------|-------------|
| **Compile-time safety** | Typos in field names/types cause compilation errors |
| **Write-once validation** | Validation annotations on interfaces apply everywhere |
| **Inherited documentation** | Javadoc on interface methods flows to implementations |
| **Reusable utilities** | Generic methods with intersection types |

### Utility Method Example

```java
public static <T extends Price & Cost> Double getMarkup(T dto) {
    return (dto.getPrice() - dto.getCost()) / dto.getCost();
}
```

## Conventions

- Split DTOs into `Request` (incoming) and `Response` (outgoing)
- Place interfaces in separate package to reduce noise
- Use `@Positive`, `@NotBlank`, etc. on interface methods
- Document semantic meaning on interface methods

## Key Takeaways

1. Establish a single source of truth for API parameters
2. Small interfaces are better
3. Leverage IDE auto-completion and type checking
