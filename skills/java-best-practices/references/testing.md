# Testing Best Practices

Comprehensive testing patterns for JUnit 5, Mockito, AssertJ, and TDD workflows in modern Java applications.

## Table of Contents
- [Core Testing Principles](#core-testing-principles)
- [JUnit 5 Patterns](#junit-5-patterns)
- [AssertJ Fluent Assertions](#assertj-fluent-assertions)
- [Mockito Patterns](#mockito-patterns)
- [Test Builders and Fixtures](#test-builders-and-fixtures)
- [Integration Testing](#integration-testing)
- [Test Organization](#test-organization)
- [TDD Workflow](#tdd-workflow)
- [Common Testing Patterns](#common-testing-patterns)
- [Test Coverage Guidelines](#test-coverage-guidelines)
- [Key Takeaways](#key-takeaways)

## Core Testing Principles

### 1. Test Pyramid
- **Unit tests (70%)**: Fast, isolated, test single units
- **Integration tests (20%)**: Test component interactions
- **E2E tests (10%)**: Full system validation

### 2. Test-Driven Development (TDD)
1. **Red**: Write a failing test
2. **Green**: Write minimum code to pass
3. **Refactor**: Improve design while keeping tests green

### 3. Test Quality
- Tests should be fast (< 100ms for unit tests)
- Tests should be deterministic (no flaky tests)
- Tests should be independent (no order dependencies)
- Tests should be readable (clear intent)

## JUnit 5 Patterns

### Basic Test Structure (AAA Pattern)

```java
// ✅ GOOD: Arrange-Act-Assert pattern with clear naming
@Test
void shouldCalculateTotalPriceWhenMultipleItems() {
    // Arrange
    var cart = new ShoppingCart();
    cart.addItem(new Item("Book", 10.00));
    cart.addItem(new Item("Pen", 2.50));
    
    // Act
    var total = cart.calculateTotal();
    
    // Assert
    assertThat(total).isEqualTo(12.50);
}

// ❌ BAD: Unclear test name, no structure
@Test
void test1() {
    var cart = new ShoppingCart();
    cart.addItem(new Item("Book", 10.00));
    assertThat(cart.calculateTotal()).isEqualTo(10.00);
}
```

### Test Naming Conventions

```java
// ✅ GOOD: BDD-style naming (should/when/given)
@Test
void shouldThrowExceptionWhenUserNotFound() {}

@Test
void shouldReturnEmptyListWhenNoItemsExist() {}

@Test
void givenInvalidEmail_whenCreatingUser_thenThrowsException() {}

// ✅ GOOD: Descriptive method names
@Test
void calculateTotalPrice_multipleItems_returnsSum() {}

@Test
void findByEmail_existingUser_returnsUser() {}

@Test
void validatePassword_tooShort_returnsFalse() {}
```

### Parameterized Tests

```java
// ✅ GOOD: Test multiple cases efficiently
@ParameterizedTest
@ValueSource(strings = {"", " ", "  ", "\t", "\n"})
void shouldConsiderBlankStringsInvalid(String input) {
    assertThat(validator.isValid(input)).isFalse();
}

@ParameterizedTest
@CsvSource({
    "1, 1, 2",
    "5, 3, 8",
    "10, -2, 8"
})
void shouldAddTwoNumbers(int a, int b, int expected) {
    assertThat(calculator.add(a, b)).isEqualTo(expected);
}

@ParameterizedTest
@MethodSource("provideUserTestCases")
void shouldValidateUserCorrectly(User user, boolean expected) {
    assertThat(validator.isValid(user)).isEqualTo(expected);
}

static Stream<Arguments> provideUserTestCases() {
    return Stream.of(
        Arguments.of(new User("john@example.com", "Pass123!"), true),
        Arguments.of(new User("invalid-email", "Pass123!"), false),
        Arguments.of(new User("john@example.com", "weak"), false)
    );
}
```

### Lifecycle Methods

```java
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class UserServiceTest {
    
    private UserService userService;
    private Database database;
    
    @BeforeAll
    void setupClass() {
        // Run once before all tests
        database = Database.connect();
    }
    
    @BeforeEach
    void setup() {
        // Run before each test
        userService = new UserService(database);
        database.clear();
    }
    
    @AfterEach
    void teardown() {
        // Run after each test
        database.clear();
    }
    
    @AfterAll
    void teardownClass() {
        // Run once after all tests
        database.close();
    }
}
```

### Exception Testing

```java
// ✅ GOOD: AssertJ exception assertions
@Test
void shouldThrowExceptionWithCorrectMessage() {
    assertThatThrownBy(() -> userService.findById(-1L))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("ID must be positive");
}

// ✅ GOOD: JUnit 5 assertThrows
@Test
void shouldThrowUserNotFoundException() {
    var exception = assertThrows(
        UserNotFoundException.class,
        () -> userService.findById(999L)
    );
    assertThat(exception.getMessage()).contains("User not found");
}
```

### Conditional Test Execution

```java
@Test
@EnabledOnOs(OS.LINUX)
void shouldRunOnLinuxOnly() {}

@Test
@EnabledIf("isProductionEnvironment")
void shouldRunInProductionOnly() {}

@Test
@DisabledIfEnvironmentVariable(named = "CI", matches = "true")
void shouldSkipInCI() {}

boolean isProductionEnvironment() {
    return System.getenv("ENV").equals("prod");
}
```

## AssertJ Fluent Assertions

```java
// ✅ GOOD: Fluent, readable assertions
@Test
void shouldValidateUserProperties() {
    var user = userService.findById(1L);
    
    assertThat(user)
        .isNotNull()
        .extracting(User::getName, User::getEmail)
        .containsExactly("John Doe", "john@example.com");
}

// ✅ GOOD: Collection assertions
@Test
void shouldReturnActiveUsers() {
    var users = userService.findActiveUsers();
    
    assertThat(users)
        .hasSize(3)
        .extracting(User::getStatus)
        .containsOnly(UserStatus.ACTIVE);
}

// ✅ GOOD: Soft assertions (all failures reported)
@Test
void shouldValidateAllUserFields() {
    var user = new User("John", "john@example.com");
    
    assertSoftly(softly -> {
        softly.assertThat(user.getName()).isEqualTo("John");
        softly.assertThat(user.getEmail()).endsWith("@example.com");
        softly.assertThat(user.getCreatedAt()).isNotNull();
    });
}

// ✅ GOOD: Optional assertions
@Test
void shouldFindUser() {
    var user = userRepository.findByEmail("john@example.com");
    
    assertThat(user)
        .isPresent()
        .get()
        .extracting(User::getName)
        .isEqualTo("John");
}
```

## Mockito Patterns

### Constructor Injection (Recommended)

```java
@ExtendWith(MockitoExtension.class)
class UserServiceTest {
    
    @Mock
    private UserRepository userRepository;
    
    @Mock
    private EmailService emailService;
    
    @InjectMocks
    private UserService userService;
    
    @Test
    void shouldCreateUserAndSendEmail() {
        // Arrange
        var request = new CreateUserRequest("john@example.com", "John");
        var user = User.builder()
            .email(request.email())
            .name(request.name())
            .build();
        
        when(userRepository.save(any(User.class))).thenReturn(user);
        
        // Act
        var result = userService.createUser(request);
        
        // Assert
        assertThat(result).isEqualTo(user);
        verify(emailService).sendWelcomeEmail(user);
        verify(userRepository).save(any(User.class));
    }
}
```

### Stubbing Patterns

```java
// ✅ GOOD: Basic stubbing
when(userRepository.findById(1L)).thenReturn(Optional.of(user));

// ✅ GOOD: Argument matchers
when(userRepository.save(any(User.class))).thenReturn(user);
when(emailService.send(eq("john@example.com"), anyString())).thenReturn(true);

// ✅ GOOD: Exception throwing
when(userRepository.findById(999L))
    .thenThrow(new UserNotFoundException(999L));

// ✅ GOOD: Answer for complex logic
when(userRepository.save(any(User.class)))
    .thenAnswer(invocation -> {
        User user = invocation.getArgument(0);
        user.setId(1L);
        return user;
    });

// ✅ GOOD: Void method stubbing
doThrow(new EmailException())
    .when(emailService)
    .sendWelcomeEmail(any(User.class));
```

### Verification Patterns

```java
// ✅ GOOD: Basic verification
verify(userRepository).save(user);
verify(emailService, times(1)).sendEmail(user);
verify(userRepository, never()).delete(any());

// ✅ GOOD: Argument capture
@Captor
private ArgumentCaptor<User> userCaptor;

@Test
void shouldSaveUserWithCorrectDetails() {
    userService.createUser(request);
    
    verify(userRepository).save(userCaptor.capture());
    var savedUser = userCaptor.getValue();
    
    assertThat(savedUser.getEmail()).isEqualTo(request.email());
}

// ✅ GOOD: Verify order
InOrder inOrder = inOrder(userRepository, emailService);
inOrder.verify(userRepository).save(user);
inOrder.verify(emailService).sendWelcomeEmail(user);

// ✅ GOOD: Verify no more interactions
verify(userRepository).findById(1L);
verifyNoMoreInteractions(userRepository);
```

### BDD-Style Mockito

```java
@Test
void shouldNotifyUserWhenOrderPlaced() {
    // Given
    var order = new Order("Item", 100.0);
    given(orderRepository.save(order)).willReturn(order);
    
    // When
    orderService.placeOrder(order);
    
    // Then
    then(notificationService).should().notifyUser(order);
}
```

## Test Builders and Fixtures

```java
// ✅ GOOD: Test data builder
public class UserTestBuilder {
    private Long id = 1L;
    private String name = "John Doe";
    private String email = "john@example.com";
    private UserStatus status = UserStatus.ACTIVE;
    
    public UserTestBuilder withId(Long id) {
        this.id = id;
        return this;
    }
    
    public UserTestBuilder withEmail(String email) {
        this.email = email;
        return this;
    }
    
    public UserTestBuilder inactive() {
        this.status = UserStatus.INACTIVE;
        return this;
    }
    
    public User build() {
        return User.builder()
            .id(id)
            .name(name)
            .email(email)
            .status(status)
            .build();
    }
}

// Usage in tests
@Test
void shouldFindInactiveUsers() {
    var inactiveUser = new UserTestBuilder()
        .withEmail("inactive@example.com")
        .inactive()
        .build();
    
    userRepository.save(inactiveUser);
    
    var result = userService.findInactiveUsers();
    assertThat(result).contains(inactiveUser);
}
```

## Integration Testing

For Spring Boot integration tests (`@SpringBootTest`, `@WebMvcTest`, `MockMvc`) and TestContainers patterns, see [spring-boot.md](spring-boot.md).

## Test Organization

### Package Structure

```
src/test/java/
├── com/example/myapp/
│   ├── unit/                    # Unit tests
│   │   ├── service/
│   │   │   └── UserServiceTest.java
│   │   └── util/
│   │       └── ValidationUtilsTest.java
│   ├── integration/             # Integration tests
│   │   ├── repository/
│   │   │   └── UserRepositoryTest.java
│   │   └── api/
│   │       └── UserControllerTest.java
│   └── fixtures/                # Test utilities
│       ├── UserTestBuilder.java
│       └── TestDataFactory.java
```

### Test Class Organization

```java
@ExtendWith(MockitoExtension.class)
class UserServiceTest {
    
    // 1. Dependencies (mocks/fixtures)
    @Mock private UserRepository userRepository;
    @InjectMocks private UserService userService;
    
    // 2. Test data
    private User testUser;
    
    // 3. Setup
    @BeforeEach
    void setup() {
        testUser = new User("john@example.com", "John");
    }
    
    // 4. Tests grouped by behavior
    @Nested
    @DisplayName("When creating a user")
    class CreateUser {
        
        @Test
        void shouldSaveUserToRepository() { }
        
        @Test
        void shouldThrowExceptionWhenEmailExists() { }
    }
    
    @Nested
    @DisplayName("When finding a user")
    class FindUser {
        
        @Test
        void shouldReturnUserWhenExists() { }
        
        @Test
        void shouldReturnEmptyWhenNotFound() { }
    }
}
```

## TDD Workflow

### Example: Implementing User Registration (TDD)

```java
// Step 1: RED - Write failing test
@Test
void shouldRegisterNewUser() {
    var request = new RegisterUserRequest("john@example.com", "password123");
    
    var user = userService.register(request);
    
    assertThat(user)
        .isNotNull()
        .extracting(User::getEmail)
        .isEqualTo("john@example.com");
}
// Compilation fails - register() doesn't exist

// Step 2: GREEN - Minimum implementation
public User register(RegisterUserRequest request) {
    var user = new User();
    user.setEmail(request.email());
    return userRepository.save(user);
}
// Test passes

// Step 3: REFACTOR - Add password hashing test
@Test
void shouldHashPasswordWhenRegistering() {
    var request = new RegisterUserRequest("john@example.com", "password123");
    
    var user = userService.register(request);
    
    assertThat(user.getPassword())
        .isNotEqualTo("password123")
        .startsWith("$2a$"); // BCrypt prefix
}
// Test fails - password not hashed

// Step 4: GREEN - Implement password hashing
public User register(RegisterUserRequest request) {
    var user = new User();
    user.setEmail(request.email());
    user.setPassword(passwordEncoder.encode(request.password()));
    return userRepository.save(user);
}
// Test passes

// Step 5: REFACTOR - Extract and improve
private User createUserFromRequest(RegisterUserRequest request) {
    return User.builder()
        .email(request.email())
        .password(passwordEncoder.encode(request.password()))
        .createdAt(Instant.now())
        .build();
}

public User register(RegisterUserRequest request) {
    var user = createUserFromRequest(request);
    return userRepository.save(user);
}
// All tests still pass
```

## Common Testing Patterns

### Testing Async Code

```java
@Test
void shouldProcessOrderAsynchronously() throws Exception {
    var order = new Order("Item", 100.0);
    
    var future = orderService.processAsync(order);
    
    assertThat(future)
        .succeedsWithin(Duration.ofSeconds(2))
        .satisfies(result -> {
            assertThat(result.getStatus()).isEqualTo(OrderStatus.COMPLETED);
        });
}
```

### Testing with Time

```java
// ✅ GOOD: Use Clock for testability
public class OrderService {
    private final Clock clock;
    
    public OrderService(Clock clock) {
        this.clock = clock;
    }
    
    public Order createOrder() {
        var order = new Order();
        order.setCreatedAt(Instant.now(clock));
        return order;
    }
}

@Test
void shouldSetCorrectCreationTime() {
    var fixedClock = Clock.fixed(Instant.parse("2024-01-01T00:00:00Z"), ZoneId.of("UTC"));
    var orderService = new OrderService(fixedClock);
    
    var order = orderService.createOrder();
    
    assertThat(order.getCreatedAt()).isEqualTo(Instant.parse("2024-01-01T00:00:00Z"));
}
```

### Testing REST Clients

```java
@Test
void shouldFetchUserFromExternalApi() {
    var mockServer = MockRestServiceServer.createServer(restTemplate);
    
    mockServer.expect(requestTo("/api/users/1"))
        .andExpect(method(HttpMethod.GET))
        .andRespond(withSuccess("""
            {"id": 1, "name": "John"}
            """, MediaType.APPLICATION_JSON));
    
    var user = externalUserService.fetchUser(1L);
    
    assertThat(user.getName()).isEqualTo("John");
    mockServer.verify();
}
```

## Test Coverage Guidelines

- **Minimum coverage**: 70-80% for production code
- **Focus on behavior**: Don't test getters/setters
- **Cover edge cases**: Null, empty, boundary values
- **Test error paths**: Exceptions and validation failures
- **Integration over units**: For complex workflows

### What NOT to Test

```java
// ❌ DON'T TEST: Simple getters/setters
@Test
void shouldSetAndGetName() {
    user.setName("John");
    assertThat(user.getName()).isEqualTo("John");
}

// ❌ DON'T TEST: Framework code
@Test
void shouldAutowireDependencies() {
    assertThat(userService.getUserRepository()).isNotNull();
}

// ✅ DO TEST: Business logic
@Test
void shouldCalculateDiscountBasedOnUserTier() {
    var premiumUser = new UserTestBuilder().premium().build();
    var discount = pricingService.calculateDiscount(premiumUser, 100.0);
    assertThat(discount).isEqualTo(15.0); // 15% for premium
}
```

## Key Takeaways

1. **Write tests first** (TDD) to drive better design
2. **Use AAA pattern** for clarity: Arrange-Act-Assert
3. **Name tests descriptively**: `shouldCalculateTotalWhenMultipleItems`
4. **Prefer AssertJ** for fluent, readable assertions
5. **Use constructors for mocks**: `@ExtendWith(MockitoExtension.class)` + `@InjectMocks`
6. **Test builders** for flexible test data creation
7. **TestContainers** for real dependencies in integration tests
8. **Keep tests fast**: Unit tests < 100ms, integration < 1s
9. **One assertion concept** per test (multiple assertions OK if same concept)
10. **Test behavior, not implementation**: Focus on what, not how
