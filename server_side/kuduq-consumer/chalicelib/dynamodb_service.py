from __future__ import annotations

import os
from datetime import datetime
from typing import Any, Dict, List, Optional

try:
    import boto3
    from boto3.dynamodb.conditions import Attr
except Exception as exc:  # pragma: no cover - on AWS Lambda boto3 exists by default
    boto3 = None  # type: ignore
    Attr = None  # type: ignore


class DynamoDBService:
    """
    Lightweight interface to the application's DynamoDB table.

    The table uses a single-table design with items keyed by:
      - Pk: "STUDENT#<uuid>" | "SPONSOR#<uuid>" | "MERCHANT#<uuid>" | ...
      - Sk: "USER" for user records

    This service provides convenience list operations that scan for the
    respective prefixes. While Query is generally preferred, listing across
    all entity IDs requires a Scan because the partition key varies per item.

    Environment variables (optional):
      - DDB_TABLE or KUDU_TABLE_NAME: the DynamoDB table name
      - AWS_REGION (or standard AWS region resolution)
    """

    def __init__(
        self,
        table_name: Optional[str] = None,
        *,
        region_name: Optional[str] = None,
    ) -> None:
        if boto3 is None:
            raise RuntimeError("boto3 is not available in this environment. On AWS Lambda it is provided by default.")

        self.table_name = table_name or os.environ.get("DDB_TABLE") or os.environ.get("KUDU_TABLE_NAME")
        if not self.table_name:
            raise ValueError("DynamoDB table name not provided. Pass table_name or set DDB_TABLE/KUDU_TABLE_NAME env var.")

        self._dynamodb = boto3.resource("dynamodb", region_name=region_name) if region_name else boto3.resource("dynamodb")
        self._table = self._dynamodb.Table(self.table_name)

    # Public API
    def list_students(self, *, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        return self._scan_by_prefix("STUDENT#", limit=limit)

    def list_sponsors(self, *, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        return self._scan_by_prefix("SPONSOR#", limit=limit)

    def list_merchants(self, *, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        return self._scan_by_prefix("MERCHANT#", limit=limit)

    def set_id_activated(self, user_id: str, *, activated: bool = True) -> None:
        self._table.put_item(
            Item={
                "Pk": user_id,
                "Sk": "RAPYD#USER",
                "Activated": activated,
                "ActivatedAt": datetime.now().isoformat()
            }
        )

    def is_id_activated(self, user_id: str) -> bool:
        resp = self._table.get_item(Key={"Pk": user_id, "Sk": "RAPYD#USER"})
        if "Item" in resp:
            return resp["Item"].get("Activated", False)
        return False

    # Internal helpers
    def _scan_by_prefix(self, pk_prefix: str, *, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        """Scan the table for items where Pk begins with pk_prefix and Sk == 'USER'.

        Handles pagination and an optional overall limit.
        """
        if Attr is None:
            raise RuntimeError("boto3.dynamodb.conditions.Attr not available")

        items: List[Dict[str, Any]] = []
        exclusive_start_key: Optional[Dict[str, Any]] = None

        remaining = limit if isinstance(limit, int) and limit > 0 else None

        filter_expr = Attr("Sk").eq("USER") & Attr("Pk").begins_with(pk_prefix)

        while True:
            scan_kwargs: Dict[str, Any] = {"FilterExpression": filter_expr}
            if exclusive_start_key is not None:
                scan_kwargs["ExclusiveStartKey"] = exclusive_start_key
            # If the caller provided a limit, apply per-scan Limit as a soft cap
            if remaining is not None:
                scan_kwargs["Limit"] = max(1, min(1000, remaining))  # DynamoDB caps per-page anyway

            resp = self._table.scan(**scan_kwargs)
            batch = resp.get("Items", [])

            if remaining is not None:
                # Trim to the requested total limit
                needed = max(0, remaining - len(items))
                if needed <= 0:
                    break
                items.extend(batch[:needed])
                remaining -= min(len(batch), needed)
            else:
                items.extend(batch)

            exclusive_start_key = resp.get("LastEvaluatedKey")
            if not exclusive_start_key:
                break
            if remaining is not None and remaining <= 0:
                break

        return items


def create_dynamodb_service(table_name: Optional[str] = None, *, region_name: Optional[str] = None) -> DynamoDBService:
    return DynamoDBService(table_name=table_name, region_name=region_name)
