# Spring Boot Integration

Best practices for integrating modern Java patterns with Spring Boot applications, covering dependency injection, data access, configuration, security, virtual threads, and observability.

## Table of Contents

- [Constructor-Based Dependency Injection](#constructor-based-dependency-injection)
- [Spring Data Repository Patterns](#spring-data-repository-patterns)
- [Transaction Management](#transaction-management)
- [Configuration Patterns](#configuration-patterns)
- [Virtual Threads with Spring Boot 3.2+](#virtual-threads-with-spring-boot-32)
- [Actuator and Observability](#actuator-and-observability)
- [Spring Boot Testing](#spring-boot-testing)
- [Complete REST API Example](#complete-rest-api-example)

---

## Constructor-Based Dependency Injection

```java
// ❌ BAD: Field injection — untestable, hides dependencies
@Service
public class UserService {
    @Autowired
    private UserRepository userRepository;
    @Autowired
    private EmailService emailService;
}

// ✅ GOOD: Constructor injection — explicit, testable, immutable
@Service
public class UserService {

    private final UserRepository userRepository;
    private final EmailService emailService;

    // Single constructor: @Autowired is optional
    public UserService(UserRepository userRepository, EmailService emailService) {
        this.userRepository = userRepository;
        this.emailService = emailService;
    }
}

// ✅ GOOD: Lombok shorthand for constructor injection
@Service
@RequiredArgsConstructor
public class UserService {
    private final UserRepository userRepository;
    private final EmailService emailService;
}
```

**Why constructor injection:**
- Dependencies are explicit and visible
- Fields can be `final` (immutable)
- Easy to unit test (pass mocks in constructor)
- Fails fast if dependency is missing (compile-time error)

---

## Spring Data Repository Patterns

```java
// ✅ GOOD: Derived query methods
public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByEmail(String email);

    List<User> findByStatusOrderByCreatedAtDesc(UserStatus status);

    boolean existsByEmail(String email);

    // Pagination
    Page<User> findByStatus(UserStatus status, Pageable pageable);

    // Projections — return only needed fields
    @Query("SELECT new com.example.dto.UserSummary(u.id, u.name, u.email) FROM User u WHERE u.status = :status")
    List<UserSummary> findSummariesByStatus(@Param("status") UserStatus status);
}

// ✅ GOOD: Using pagination in service layer
@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;

    public Page<User> getActiveUsers(int page, int size) {
        var pageable = PageRequest.of(page, size, Sort.by("createdAt").descending());
        return userRepository.findByStatus(UserStatus.ACTIVE, pageable);
    }
}
```

---

## Transaction Management

```java
// ✅ GOOD: @Transactional on service methods
@Service
@RequiredArgsConstructor
public class OrderService {

    private final OrderRepository orderRepository;
    private final InventoryService inventoryService;
    private final EventPublisher eventPublisher;

    // Read-write transaction (default)
    @Transactional
    public Order placeOrder(CreateOrderRequest request) {
        var order = Order.from(request);
        inventoryService.reserve(order.getItems());
        var saved = orderRepository.save(order);
        eventPublisher.publish(new OrderPlacedEvent(saved));
        return saved;
    }

    // Read-only transaction — optimizes Hibernate flush mode
    @Transactional(readOnly = true)
    public List<Order> getOrdersByUser(Long userId) {
        return orderRepository.findByUserIdOrderByCreatedAtDesc(userId);
    }
}

// ❌ BAD: @Transactional on private methods (ignored by proxy)
@Transactional
private void updateInternal() { /* Spring proxy cannot intercept this */ }

// ❌ BAD: @Transactional on controller (too wide scope)
@Transactional
@GetMapping("/users")
public List<User> getUsers() { /* DB connection held during response serialization */ }
```

**Transaction rules:**
- Place `@Transactional` on service methods, not controllers or repositories
- Use `readOnly = true` for query-only methods
- Avoid `@Transactional` on private methods (Spring proxies can't intercept)
- Keep transactions as short as possible

---

## Configuration Patterns

```java
// ✅ GOOD: Type-safe configuration with @ConfigurationProperties
@ConfigurationProperties(prefix = "app.notification")
public record NotificationConfig(
    boolean enabled,
    String fromEmail,
    int retryCount,
    Duration timeout
) {}

// Enable in application class or config
@SpringBootApplication
@EnableConfigurationProperties(NotificationConfig.class)
public class Application { }

// application.yml
// app:
//   notification:
//     enabled: true
//     from-email: noreply@example.com
//     retry-count: 3
//     timeout: 30s

// ✅ GOOD: Inject and use
@Service
@RequiredArgsConstructor
public class NotificationService {

    private final NotificationConfig config;

    public void send(String to, String body) {
        if (!config.enabled()) return;
        // retry up to config.retryCount() times
        // timeout after config.timeout()
    }
}

// ✅ GOOD: Profile-specific configuration
// application-dev.yml
// app.notification.enabled: false

// application-prod.yml
// app.notification.enabled: true
```

```java
// ❌ BAD: Scattered @Value annotations
@Service
public class NotificationService {
    @Value("${app.notification.enabled}")
    private boolean enabled;
    @Value("${app.notification.from-email}")
    private String fromEmail;
    // ... hard to test, no type safety, no grouping
}
```

---

## Virtual Threads with Spring Boot 3.2+

```yaml
# application.yml — enable virtual threads globally
spring:
  threads:
    virtual:
      enabled: true
```

```java
// With virtual threads enabled, Spring Boot 3.2+ automatically:
// - Handles web requests on virtual threads (Tomcat/Jetty)
// - Uses virtual threads for @Async methods
// - Uses virtual threads for Spring MVC request handling

// ✅ GOOD: Blocking I/O is fine with virtual threads
@RestController
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;
    private final ExternalApiClient apiClient;

    @GetMapping("/users/{id}/profile")
    public UserProfile getProfile(@PathVariable Long id) {
        // These blocking calls are efficient on virtual threads
        var user = userService.findById(id);
        var preferences = apiClient.fetchPreferences(id);
        return new UserProfile(user, preferences);
    }
}

// ⚠️ CAUTION: Replace synchronized with ReentrantLock
// (prevents virtual thread pinning)
// ❌ BAD with virtual threads:
synchronized (this) {
    return dataSource.getConnection();
}

// ✅ GOOD with virtual threads:
private final ReentrantLock lock = new ReentrantLock();

public Connection getConnection() {
    lock.lock();
    try {
        return dataSource.getConnection();
    } finally {
        lock.unlock();
    }
}
```

---

## Actuator and Observability

```yaml
# application.yml
management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics,prometheus
  endpoint:
    health:
      show-details: when-authorized
      probes:
        enabled: true  # Kubernetes readiness/liveness
  health:
    db:
      enabled: true
    diskSpace:
      enabled: true
```

```java
// ✅ GOOD: Custom health indicator
@Component
public class ExternalApiHealthIndicator implements HealthIndicator {

    private final ExternalApiClient apiClient;

    public ExternalApiHealthIndicator(ExternalApiClient apiClient) {
        this.apiClient = apiClient;
    }

    @Override
    public Health health() {
        try {
            apiClient.ping();
            return Health.up()
                .withDetail("service", "external-api")
                .build();
        } catch (Exception e) {
            return Health.down()
                .withDetail("service", "external-api")
                .withException(e)
                .build();
        }
    }
}

// ✅ GOOD: Custom metrics with Micrometer
@Service
@RequiredArgsConstructor
public class OrderService {

    private final MeterRegistry meterRegistry;

    public Order placeOrder(CreateOrderRequest request) {
        return meterRegistry.timer("orders.placed").record(() -> {
            // process order...
            meterRegistry.counter("orders.total",
                "status", "created",
                "type", request.type().name()
            ).increment();
            return processOrder(request);
        });
    }
}
```

---

## Spring Boot Testing

Spring Boot testing hierarchy: unit → slice → full integration.

### Slice Tests (Web Layer Only)

```java
// ✅ GOOD: Tests only the web layer, mocks service
@WebMvcTest(UserController.class)
class UserControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private UserService userService;

    @Test
    void shouldReturnUserById() throws Exception {
        var user = new User(1L, "John", "john@example.com");
        when(userService.findById(1L)).thenReturn(user);

        mockMvc.perform(get("/api/users/1"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.name").value("John"));
    }
}
```

### Full Integration Tests

```java
// ✅ GOOD: Full Spring context with real HTTP layer
@SpringBootTest
@AutoConfigureMockMvc
class UserControllerIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @BeforeEach
    void setup() {
        userRepository.deleteAll();
    }

    @Test
    void shouldCreateUserSuccessfully() throws Exception {
        mockMvc.perform(post("/api/users")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"name": "John Doe", "email": "john@example.com"}
                    """))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.name").value("John Doe"));

        assertThat(userRepository.findAll()).hasSize(1);
    }
}
```

### TestContainers for Real Dependencies

```java
// ✅ GOOD: Integration test with real database
@SpringBootTest
@Testcontainers
class UserRepositoryIntegrationTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16")
        .withDatabaseName("testdb")
        .withUsername("test")
        .withPassword("test");

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
    }

    @Autowired
    private UserRepository userRepository;

    @Test
    void shouldPersistUser() {
        var user = new User("John", "john@example.com");
        var saved = userRepository.save(user);

        assertThat(saved.getId()).isNotNull();
        assertThat(userRepository.findById(saved.getId()))
            .isPresent()
            .get()
            .extracting(User::getName)
            .isEqualTo("John");
    }
}
```

---

## Complete REST API Example

A fully runnable Spring Boot REST API combining Records, validation, exception handling, testing, and modern patterns.

```java
// --- Model ---
package com.example.userapi.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "users")
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false, unique = true)
    private String email;

    @Enumerated(EnumType.STRING)
    private UserStatus status = UserStatus.ACTIVE;

    private Instant createdAt = Instant.now();

    protected User() {} // JPA

    public User(String name, String email) {
        this.name = name;
        this.email = email;
    }

    // getters...
    public Long getId() { return id; }
    public String getName() { return name; }
    public String getEmail() { return email; }
    public UserStatus getStatus() { return status; }
    public Instant getCreatedAt() { return createdAt; }
}

// --- DTOs (Records) ---
package com.example.userapi.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateUserRequest(
    @NotBlank(message = "Name is required")
    @Size(min = 2, max = 100, message = "Name must be 2-100 characters")
    String name,

    @NotBlank(message = "Email is required")
    @Email(message = "Must be a valid email address")
    String email
) {}

public record UserResponse(
    Long id,
    String name,
    String email,
    String status,
    Instant createdAt
) {
    public static UserResponse from(User user) {
        return new UserResponse(
            user.getId(),
            user.getName(),
            user.getEmail(),
            user.getStatus().name(),
            user.getCreatedAt()
        );
    }
}

// --- Repository ---
package com.example.userapi.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByEmail(String email);
    boolean existsByEmail(String email);
}

// --- Service ---
package com.example.userapi.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;

    @Transactional
    public User createUser(CreateUserRequest request) {
        if (userRepository.existsByEmail(request.email())) {
            throw new DuplicateResourceException("User", "email", request.email());
        }
        return userRepository.save(new User(request.name(), request.email()));
    }

    @Transactional(readOnly = true)
    public User findById(Long id) {
        return userRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("User", id));
    }
}

// --- Exception hierarchy ---
package com.example.userapi.exception;

public class AppException extends RuntimeException {
    private final String errorCode;

    public AppException(String message, String errorCode) {
        super(message);
        this.errorCode = errorCode;
    }

    public String getErrorCode() { return errorCode; }
}

public class ResourceNotFoundException extends AppException {
    public ResourceNotFoundException(String resource, Long id) {
        super("%s not found with id: %d".formatted(resource, id), "NOT_FOUND");
    }
}

public class DuplicateResourceException extends AppException {
    public DuplicateResourceException(String resource, String field, String value) {
        super("%s already exists with %s: %s".formatted(resource, field, value), "DUPLICATE");
    }
}

// --- Global exception handler ---
package com.example.userapi.exception;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(ResourceNotFoundException.class)
    public ProblemDetail handleNotFound(ResourceNotFoundException ex) {
        var problem = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, ex.getMessage());
        problem.setProperty("errorCode", ex.getErrorCode());
        return problem;
    }

    @ExceptionHandler(DuplicateResourceException.class)
    public ProblemDetail handleDuplicate(DuplicateResourceException ex) {
        var problem = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, ex.getMessage());
        problem.setProperty("errorCode", ex.getErrorCode());
        return problem;
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ProblemDetail handleValidation(MethodArgumentNotValidException ex) {
        var problem = ProblemDetail.forStatus(HttpStatus.BAD_REQUEST);
        problem.setProperty("errorCode", "VALIDATION_ERROR");
        var errors = ex.getBindingResult().getFieldErrors().stream()
            .map(e -> Map.of("field", e.getField(), "message", e.getDefaultMessage()))
            .toList();
        problem.setProperty("errors", errors);
        return problem;
    }
}

// --- Controller ---
package com.example.userapi.controller;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public UserResponse createUser(@Valid @RequestBody CreateUserRequest request) {
        return UserResponse.from(userService.createUser(request));
    }

    @GetMapping("/{id}")
    public UserResponse getUser(@PathVariable Long id) {
        return UserResponse.from(userService.findById(id));
    }
}

// --- Unit test ---
package com.example.userapi.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class UserServiceTest {

    @Mock private UserRepository userRepository;
    @InjectMocks private UserService userService;

    @Test
    void shouldCreateUserSuccessfully() {
        // Arrange
        var request = new CreateUserRequest("John Doe", "john@example.com");
        var user = new User("John Doe", "john@example.com");
        when(userRepository.existsByEmail("john@example.com")).thenReturn(false);
        when(userRepository.save(any(User.class))).thenReturn(user);

        // Act
        var result = userService.createUser(request);

        // Assert
        assertThat(result.getName()).isEqualTo("John Doe");
        assertThat(result.getEmail()).isEqualTo("john@example.com");
        verify(userRepository).save(any(User.class));
    }

    @Test
    void shouldThrowWhenEmailAlreadyExists() {
        var request = new CreateUserRequest("Jane", "jane@example.com");
        when(userRepository.existsByEmail("jane@example.com")).thenReturn(true);

        assertThatThrownBy(() -> userService.createUser(request))
            .isInstanceOf(DuplicateResourceException.class)
            .hasMessageContaining("jane@example.com");
    }
}

// --- Integration test ---
package com.example.userapi.controller;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.bean.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(UserController.class)
class UserControllerTest {

    @Autowired private MockMvc mockMvc;
    @MockBean private UserService userService;

    @Test
    void shouldCreateUser() throws Exception {
        var user = new User("John Doe", "john@example.com");
        when(userService.createUser(any())).thenReturn(user);

        mockMvc.perform(post("/api/users")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                        "name": "John Doe",
                        "email": "john@example.com"
                    }
                    """))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.name").value("John Doe"))
            .andExpect(jsonPath("$.email").value("john@example.com"));
    }

    @Test
    void shouldReturn400WhenNameIsBlank() throws Exception {
        mockMvc.perform(post("/api/users")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                        "name": "",
                        "email": "john@example.com"
                    }
                    """))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.errorCode").value("VALIDATION_ERROR"));
    }
}
```
