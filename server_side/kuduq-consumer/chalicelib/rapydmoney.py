"""
Rapyd Money Stablecoin API Python Client for AWS Chalice

Mirrors the TypeScript RapydMoneyService class.
Base URL: https://seal-app-qp9cc.ondigitalocean.app/api/v1

Usage:
    from chalicelib.rapydmoney import create_rapydmoney_service
    service = create_rapydmoney_service(api_token)
    user = service.create_user({"email": "test@example.com", "firstName": "T", "lastName": "E"})

Notes:
- Authorization uses Bearer token
- JSON Content-Type
- Raises RapydMoneyAPIError for non-2xx responses
- Default timeout is 10 seconds (override via method timeout=...)
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional
import json
from decimal import Decimal
import requests

try:
    # Prefer Pydantic v2
    from pydantic import BaseModel, Field, ConfigDict

    _PYDANTIC_V2 = True
except Exception:
    # Fallback to Pydantic v1
    from pydantic import BaseModel, Field  # type: ignore

    _PYDANTIC_V2 = False

BASE_URL = "https://seal-app-qp9cc.ondigitalocean.app/api/v1"


class RapydMoneyAPIError(Exception):
    def __init__(self, status_code: int, url: str, body: Optional[str] = None, message: Optional[str] = None):
        self.status_code = status_code
        self.url = url
        self.body = body
        self.message = message or f"API Error {status_code} for {url}"
        super().__init__(self.__str__())

    def __str__(self) -> str:
        suffix = f" Body: {self.body}" if self.body else ""
        return f"{self.message}{suffix}"


class RapydMoneyUser(BaseModel):
    id: str
    email: str
    first_name: str = Field(alias="firstName")
    last_name: str = Field(alias="lastName")
    public_key: str = Field(alias="publicKey")
    payment_identifier: str = Field(alias="paymentIdentifier")

    # Config for both Pydantic v1 and v2
    if '_PYDANTIC_V2' in globals() and _PYDANTIC_V2:
        model_config = ConfigDict(populate_by_name=True)
    else:
        class Config:
            allow_population_by_field_name = True  # type: ignore[attr-defined]

    @classmethod
    def from_api(cls, data: Dict[str, Any]) -> "RapydMoneyUser":
        # Pydantic v2
        if hasattr(cls, "model_validate"):
            return cls.model_validate(data)  # type: ignore[attr-defined]
        # Pydantic v1
        return cls.parse_obj(data)  # type: ignore[attr-defined]


class RapydMoneyBalance(BaseModel):
    """Simple balance wrapper with two attributes: ZAR and USD."""
    zar: Decimal = Decimal("0")
    usd: Decimal = Decimal("0")

    @classmethod
    def from_api(cls, data: Dict[str, Any]) -> "RapydMoneyBalance":
        """
        Build RapydMoneyBalance from API response shapes like:
        - {"tokens": [{"name":"L ZAR Coin","balance":"0.0"}, {"name":"L USD Coin","balance":"0.0"}]}
        - {"balance": {"tokens": [...]}}
        Missing tokens default to 0.
        """
        # Normalize to the object that contains "tokens"
        src: Dict[str, Any] = {}
        if isinstance(data, dict) and "tokens" in data:
            src = data
        elif isinstance(data, dict) and "balance" in data and isinstance(data["balance"], dict):
            src = data["balance"]  # type: ignore[assignment]

        zar = Decimal("0")
        usd = Decimal("0")
        tokens = src.get("tokens", []) if isinstance(src, dict) else []
        if isinstance(tokens, list):
            for t in tokens:
                if not isinstance(t, dict):
                    continue
                name = t.get("name")
                bal_raw = t.get("balance", "0")
                try:
                    bal = Decimal(str(bal_raw))
                except Exception:
                    bal = Decimal("0")
                if name == "L ZAR Coin":
                    zar = bal
                elif name == "L USD Coin":
                    usd = bal

        # Pydantic v2/v1 compatible construction
        payload = {"zar": zar, "usd": usd}
        if hasattr(cls, "model_validate"):
            return cls.model_validate(payload)  # type: ignore[attr-defined]
        return cls.parse_obj(payload)  # type: ignore[attr-defined]


class RapydMoneyService:
    def __init__(self, api_token: str, base_url: str = BASE_URL, default_timeout: float = 10.0):
        self.api_token = api_token
        self.base_url = base_url.rstrip('/')
        self.default_timeout = default_timeout

    # Internal helpers
    def _headers(self) -> Dict[str, str]:
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_token}",
        }

    def _request(self, method: str, path: str, *, json_body: Optional[Dict[str, Any]] = None,
                 timeout: Optional[float] = None) -> Any:
        url = f"{self.base_url}/{path.lstrip('/')}"
        try:
            resp = requests.request(
                method=method.upper(),
                url=url,
                headers=self._headers(),
                json=json_body,
                timeout=timeout or self.default_timeout,
            )
        except requests.RequestException as e:
            raise RapydMoneyAPIError(status_code=-1, url=url, body=str(e), message="Network error")

        if not (200 <= resp.status_code < 300):
            body_text: Optional[str]
            try:
                body_text = resp.text
            except Exception:
                body_text = None
            raise RapydMoneyAPIError(status_code=resp.status_code, url=url, body=body_text)

        # Try to parse JSON; if fails, return raw text
        if resp.content:
            try:
                return resp.json()
            except json.JSONDecodeError:
                return resp.text
        return None

    # Public API methods
    def create_user(self, user_data: Dict[str, Any], *, timeout: Optional[float] = None) -> Dict[str, Any]:
        data = self._request("POST", "/users", json_body=user_data, timeout=timeout)
        # Some implementations return {"user": {...}}; some return the object directly
        if isinstance(data, dict) and "user" in data and isinstance(data["user"], dict):
            return data["user"]
        return data

    def list_users(self, *, timeout: Optional[float] = None) -> List[RapydMoneyUser]:
        data = self._request("GET", "/users", timeout=timeout)
        users_data: List[Dict[str, Any]] = []
        if isinstance(data, dict) and "users" in data and isinstance(data["users"], list):
            users_data = [u for u in data["users"] if isinstance(u, dict)]
        elif isinstance(data, list):
            users_data = [u for u in data if isinstance(u, dict)]
        else:
            return []
        return [RapydMoneyUser.from_api(u) for u in users_data]

    def get_user(self, user_id: str, *, timeout: Optional[float] = None) -> RapydMoneyUser:
        data = self._request("GET", f"/users/{user_id}", timeout=timeout)
        if isinstance(data, dict) and "user" in data and isinstance(data["user"], dict):
            return RapydMoneyUser.from_api(data["user"])
        if isinstance(data, dict):
            return RapydMoneyUser.from_api(data)
        # Unexpected shape
        raise RapydMoneyAPIError(
            status_code=-1,
            url=f"{self.base_url}/users/{user_id}",
            body=str(data),
            message="Unexpected response shape for get_user"
        )

    def get_balance(self, user_id: str, *, timeout: Optional[float] = None) -> RapydMoneyBalance:
        data = self._request("GET", f"/{user_id}/balance", timeout=timeout)
        # Support both {"tokens":[...]} and {"balance":{"tokens":[...]}}; default to zeros if absent
        src: Dict[str, Any] = {}
        if isinstance(data, dict) and "balance" in data and isinstance(data["balance"], dict):
            src = data["balance"]
        elif isinstance(data, dict):
            src = data
        return RapydMoneyBalance.from_api(src)

    def get_transactions(self, user_id: str, *, timeout: Optional[float] = None) -> List[Dict[str, Any]]:
        data = self._request("GET", f"/{user_id}/transactions", timeout=timeout)
        if isinstance(data, dict) and "transactions" in data and isinstance(data["transactions"], list):
            return data["transactions"]
        if isinstance(data, list):
            return data
        return []

    def create_bank_account(self, user_id: str, bank_data: Dict[str, Any], *, timeout: Optional[float] = None) -> Dict[
        str, Any]:
        data = self._request("POST", f"/bank/{user_id}", json_body=bank_data, timeout=timeout)
        if isinstance(data, dict) and "bankAccount" in data and isinstance(data["bankAccount"], dict):
            return data["bankAccount"]
        return data

    def get_bank_account(self, user_id: str, *, timeout: Optional[float] = None) -> Dict[str, Any]:
        data = self._request("GET", f"/bank/{user_id}", timeout=timeout)
        if isinstance(data, dict) and "bankAccount" in data and isinstance(data["bankAccount"], dict):
            return data["bankAccount"]
        return data

    def activate_pay(self, user_id: str, *, timeout: Optional[float] = None) -> Dict[str, Any]:
        data = self._request("POST", f"/activate-pay/{user_id}", timeout=timeout)
        return data if isinstance(data, dict) else {"success": True}

    def get_recipient(self, payment_identifier: str, *, timeout: Optional[float] = None) -> Dict[str, Any]:
        data = self._request("GET", f"/recipient/{payment_identifier}", timeout=timeout)
        if isinstance(data, dict) and "recipient" in data and isinstance(data["recipient"], dict):
            return data["recipient"]
        return data

    def mint(self, mint_data: Dict[str, Any], *, timeout: Optional[float] = None) -> Dict[str, Any]:
        data = self._request("POST", "/mint", json_body=mint_data, timeout=timeout)
        return data

    def do_transfer(self,
                    from_user_id: str,
                    to_user_identifier: str,
                    amount: Decimal,
                    trx_id: str,
                    timeout: float = 60.0
                    ):

        trx = {
            "transactionAmount": amount,
            "transactionRecipient": to_user_identifier,
            "transactionNotes": trx_id
        }

        data = self._request("POST", f"/transfer/{from_user_id}", json_body=trx, timeout=timeout)
        if data:
            if 'message' in data:
                if 'successful' in str(data['message']).lower():
                    return data

        return False


# Factory function

def create_rapydmoney_service(api_token: str, *, base_url: str = BASE_URL,
                              default_timeout: float = 10.0) -> RapydMoneyService:
    return RapydMoneyService(api_token=api_token, base_url=base_url, default_timeout=default_timeout)
