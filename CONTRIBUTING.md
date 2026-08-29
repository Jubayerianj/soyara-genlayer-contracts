# Contributing to Soyara DEX & GenLayer Ecosystem

Thank you for your interest in contributing to the project! We welcome code contributions, bug reports, documentation updates, and security suggestions.

---

## 🧭 Code of Conduct
We are committed to providing a friendly, safe, and welcoming environment for everyone. Please be respectful and constructive in all discussions and pull requests.

---

## 🛠 Development Workflow

1. Fork & Branch

   - Fork this repository.
   - Create a feature branch: `git checkout -b feature/my-new-feature` or `bugfix/issue-description`.

2. Smart Contracts (Solidity & Foundry)**
   - Run tests before submitting PRs:
     ```bash
     cd "Dex Solidity contracts/aggregator"
     forge test
     ```
   - Ensure formatting is consistent.

3. Intelligent Contracts (GenLayer / Python)**
   - Maintain strict typing in `AgentValidator.py` and `LiquidityValidator.py`.
   - Ensure non-deterministic prompt evaluations adhere to GenLayer's equivalence principle rules (`gl.eq_principle.strict_eq`).

4. Frontend (Next.js)
   - Run linter and tests:
     ```bash
     cd frontend/flipswap
     npm run lint
     ```

5. Submitting Changes
   - Provide clear, descriptive commit messages following the [Conventional Commits](https://www.conventionalcommits.org/) standard:
     - `feat: add support for new routing strategy`
     - `fix: correct tick calculation boundary in LiquidityValidator`
     - `docs: update deployment addresses in registry`
   - Open a Pull Request against the `main` branch with an explanation of your changes.

---

