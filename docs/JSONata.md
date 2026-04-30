# JSONata Rule Builder

JSONata Rule Builder to wizualne narzędzie dostępne pod adresem `http://localhost:3737/jsonata-rule-builder.html`, które pozwala na tworzenie zaawansowanych reguł transformacji danych bez konieczności ręcznego pisania skomplikowanej składni JSONata.

## Czym jest JSONata?
JSONata to język zapytań i transformacji dla danych JSON. W projekcie HITL-MCP jest wykorzystywany w trybie **Proxy** do modyfikowania zapytań i odpowiedzi "w locie".

## Do czego służy Rule Builder?
Pozwala na:
- **Wybór pola do transformacji**: np. treść wiadomości (`messages[].content`).
- **Ustawienie warunków**: np. "zmień tylko jeśli nadawcą jest `user`".
- **Definiowanie akcji**: np. "podmień tekst używając Regex" lub "dopisz instrukcję systemową".
- **Testowanie**: Możesz wkleić przykładowy JSON i od razu zobaczyć wynik transformacji.

## Jak użyć wygenerowanej reguły?
1. Skonfiguruj transformację w Builderze.
2. Skopiuj wygenerowane wyrażenie JSONata.
3. Wklej je do konfiguracji reguł Proxy (zakładka "Proxy Rules" w interfejsie przeglądarkowym).

Dzięki temu możesz np. automatycznie usuwać wrażliwe dane z logów lub wymuszać na modelu konkretny format odpowiedzi bez zmiany kodu samego rozszerzenia.
