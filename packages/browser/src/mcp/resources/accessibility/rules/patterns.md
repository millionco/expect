# Accessible Component Patterns

React/TSX patterns for common accessible widgets. Use these as starting points — prefer established UI library primitives (Radix, Headless UI) over custom implementations.

## Modal Dialog

Key requirements: focus trap, ESC to close, restore focus to trigger, `aria-modal`.

```tsx
function Modal({ isOpen, onClose, title, children }) {
  const modalRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      triggerRef.current = document.activeElement as HTMLElement;
      modalRef.current?.focus();
    } else {
      triggerRef.current?.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      ref={modalRef}
      tabIndex={-1}
      onKeyDown={(event) => event.key === "Escape" && onClose()}
    >
      <h2 id="modal-title">{title}</h2>
      {children}
      <button onClick={onClose} aria-label="Close modal">
        <span aria-hidden="true">&times;</span>
      </button>
    </div>
  );
}
```

## Dropdown / Listbox

Key requirements: Arrow key navigation, Enter/Space to select, ESC to close, `aria-expanded`, `aria-haspopup`.

```tsx
function Dropdown({ label, options, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!isOpen) setIsOpen(true);
        else setSelectedIndex((index) => (index + 1) % options.length);
        break;
      case "ArrowUp":
        event.preventDefault();
        if (!isOpen) setIsOpen(true);
        else setSelectedIndex((index) => (index - 1 + options.length) % options.length);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (isOpen) {
          onChange(options[selectedIndex].value);
          setIsOpen(false);
          buttonRef.current?.focus();
        } else {
          setIsOpen(true);
        }
        break;
      case "Escape":
        event.preventDefault();
        setIsOpen(false);
        buttonRef.current?.focus();
        break;
    }
  };

  return (
    <div onKeyDown={handleKeyDown}>
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        {label}
      </button>
      {isOpen && (
        <ul role="listbox" tabIndex={-1}>
          {options.map((option, index) => (
            <li
              key={option.value}
              role="option"
              aria-selected={index === selectedIndex}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
            >
              {option.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

## Accessible Form

Key requirements: labels linked to inputs, errors linked via `aria-describedby`, `role="alert"` on error messages, `aria-invalid` on invalid fields.

```tsx
function ContactForm() {
  const [errors, setErrors] = useState<Record<string, string>>({});

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div>
        <label htmlFor="name">
          Name <span aria-label="required">*</span>
        </label>
        <input
          type="text"
          id="name"
          required
          aria-required="true"
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? "name-error" : undefined}
        />
        {errors.name && (
          <span id="name-error" role="alert">
            {errors.name}
          </span>
        )}
      </div>

      <div>
        <label htmlFor="email">
          Email <span aria-label="required">*</span>
        </label>
        <input
          type="email"
          id="email"
          required
          aria-required="true"
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? "email-error" : "email-hint"}
        />
        <span id="email-hint">We'll never share your email.</span>
        {errors.email && (
          <span id="email-error" role="alert">
            {errors.email}
          </span>
        )}
      </div>

      <button type="submit">Submit</button>
    </form>
  );
}
```

## Tab Panel

Key requirements: Arrow keys switch tabs, `role="tablist"`/`role="tab"`/`role="tabpanel"`, `aria-selected`, roving `tabindex`.

```tsx
function Tabs({ tabs }) {
  const [activeTab, setActiveTab] = useState(0);

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        setActiveTab((index + 1) % tabs.length);
        break;
      case "ArrowLeft":
        event.preventDefault();
        setActiveTab((index - 1 + tabs.length) % tabs.length);
        break;
      case "Home":
        event.preventDefault();
        setActiveTab(0);
        break;
      case "End":
        event.preventDefault();
        setActiveTab(tabs.length - 1);
        break;
    }
  };

  return (
    <div>
      <div role="tablist" aria-label="Content sections">
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={activeTab === index}
            aria-controls={`panel-${tab.id}`}
            tabIndex={activeTab === index ? 0 : -1}
            onClick={() => setActiveTab(index)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab, index) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`panel-${tab.id}`}
          aria-labelledby={`tab-${tab.id}`}
          hidden={activeTab !== index}
          tabIndex={0}
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
```
