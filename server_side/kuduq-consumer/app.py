# Python
import os
import json

from chalice import Chalice
from chalicelib.parsemessage import parse_sqs_message, EventType
from chalicelib.mailer import SMTPMailer
from dotenv import load_dotenv

load_dotenv()

DB_TABLE_NAME = os.getenv("DB_TABLE_NAME")
DB_TABLE_REGION = os.getenv("DB_TABLE_REGION")

app = Chalice(app_name='kuduq-consumer')

# Initialize mailer once per container
_mailer = SMTPMailer()

# Read queue name from environment variable (configured in .chalice/config.json)
QUEUE_NAME = os.environ.get('SQS_QUEUE_NAME', 'my-app-queue')


@app.route('/pings', methods=['GET'], cors=True)
def api_ping():
    return {
        "message": "pong"
    }


@app.route('/can-pay', methods=['POST'], cors=True)
def api_can_pay():
    ###
    # Check if a user can pay
    ###

    from_user_id = app.current_request.json_body.get('studentId')
    amount_cents = app.current_request.json_body.get('amount_cents')
    amount = amount_cents / 100.0

    if from_user_id:
        from chalicelib.rapydmoney import create_rapydmoney_service
        rapyd = create_rapydmoney_service(
            api_token=os.getenv("RAPYD_MONEY_API_TOKEN"),
            base_url=os.getenv("RAPYD_MONEY_BASE_URL")
        )

        # check is user has balance
        # get/validate recipient
        # register a payment transaction as pending
        from_user_balance = rapyd.get_balance(from_user_id)
        if from_user_balance:
            if from_user_balance.zar < amount:
                return {
                    "result": False,
                    "message": "Insufficient funds"
                }
            else:
                return {
                    "result": True
                }
    else:
        return {
            "result": False,
            "message": "User not found"
        }


@app.route('/pay-user', methods=['POST'], cors=True)
def api_pay_user():
    ###
    # Pay a user with Stablecoin
    ###
    merchant_id = app.current_request.json_body.get('merchantId', None)
    student_id = app.current_request.json_body.get('studentId', None)

    if merchant_id and student_id:
        from chalicelib.rapydmoney import create_rapydmoney_service
        rapyd = create_rapydmoney_service(
            api_token=os.getenv("RAPYD_MONEY_API_TOKEN"),
            base_url=os.getenv("RAPYD_MONEY_BASE_URL")
        )

        idempotency_key = app.current_request.json_body.get('idempotency_key', None)
        amount_cents = app.current_request.json_body.get('amount_cents', None)
        amount = amount_cents / 100.0
        merchant_user = rapyd.get_user(merchant_id)
        student_user = rapyd.get_user(student_id)
        if merchant_user and student_user:
            recipient = rapyd.get_recipient(student_user.payment_identifier)
            if recipient:
                resp = rapyd.do_transfer(
                    from_user_id=student_user.id,
                    to_user_identifier=merchant_user.payment_identifier,
                    amount=amount,
                    trx_id=f"Idem_{idempotency_key}",
                )
                if resp:
                    if 'message' in resp:
                        if 'successful' in str(resp['message']).lower():
                            print("Successful transfer")
                            return {
                                "result": True,
                                "message": "Sponsor user transfer successful"
                            }

        print("Failed to transfer funds to student")
        return {
            "result": False,
            "message": "Sponsor transfer failed"
        }

    else:
        print("Invalid request: missing sponsorId or studentId")
        return {
            "result": False,
            "message": "Sponsor transfer failed, invalid request"
        }


@app.route('/fund-user', methods=['POST'], cors=True)
def api_fund_user():
    ###
    # Fund a user with Stablecoin
    ###

    sponsor_id = app.current_request.json_body.get('sponsorId', None)
    if sponsor_id:
        from chalicelib.rapydmoney import create_rapydmoney_service
        rapyd = create_rapydmoney_service(
            api_token=os.getenv("RAPYD_MONEY_API_TOKEN"),
            base_url=os.getenv("RAPYD_MONEY_BASE_URL")
        )

        amount_cents = app.current_request.json_body.get('amount_cents', None)
        amount = amount_cents / 100.0
        existing_user = rapyd.get_user(sponsor_id)
        if existing_user:
            new_mint_request = {
                "transactionAmount": amount,
                "transactionRecipient": existing_user.payment_identifier,
                "transactionNotes": "EFT deposit {} to {}".format(amount, sponsor_id)
            }

            resp = rapyd.mint(new_mint_request)
            print(resp)
            if resp:
                print("Mint request successful")
            else:
                print("Mint request failed")
        else:
            print("User {} not found".format(sponsor_id))
        return {
            "message": "User can pay"
        }
    else:
        return {
            "message": "User cannot pay"
        }

@app.route('/sponsor-user', methods=['POST'], cors=True)
def api_sponsor_user():
    print("Incoming sponsor transfer  request:", app.current_request.json_body)

    sponsor_id = app.current_request.json_body.get('sponsorId', None)
    student_id = app.current_request.json_body.get('studentId', None)

    if sponsor_id and student_id:
        # check payment transaction is pending
        # do payment
        from chalicelib.rapydmoney import create_rapydmoney_service
        # from chalicelib.dynamodb_service import create_dynamodb_service
        # db = create_dynamodb_service(table_name=DB_TABLE_NAME, region_name=DB_TABLE_REGION)

        rapyd = create_rapydmoney_service(
            api_token=os.getenv("RAPYD_MONEY_API_TOKEN"),
            base_url=os.getenv("RAPYD_MONEY_BASE_URL")
        )

        idempotency_key = app.current_request.json_body.get('idempotency_key', None)
        amount_cents = app.current_request.json_body.get('amount_cents', None)
        amount = amount_cents / 100.0
        sponsor_user = rapyd.get_user(sponsor_id)
        student_user = rapyd.get_user(student_id)
        if sponsor_user and student_user:
            recipient = rapyd.get_recipient(student_user.payment_identifier)
            if recipient:
                resp = rapyd.do_transfer(
                    from_user_id=sponsor_user.id,
                    to_user_identifier=student_user.payment_identifier,
                    amount=amount,
                    trx_id=f"Idem_{idempotency_key}",
                )
                if resp:
                    if 'message' in resp:
                        if 'successful' in str(resp['message']).lower():
                            print("Successful transfer")
                            return {
                                "result": True,
                                "message": "Sponsor user transfer successful"
                            }

        print("Failed to transfer funds to student")
        return {
            "result": False,
            "message": "Sponsor transfer failed"
        }

    else:
        print("Invalid request: missing sponsorId or studentId")
        return {
            "result": False,
            "message": "Sponsor transfer failed, invalid request"
        }


# Chalice will subscribe to the queue specified by QUEUE_NAME
@app.on_sqs_message(queue=QUEUE_NAME, batch_size=10)
def handle_my_queue(event):
    for record in event:
        body_str = record.body
        app.log.info(f"Got message: {body_str}")

        # Parse body as JSON. Some producers may wrap the message in a 'Message' field (e.g., SNS->SQS)
        try:
            data = json.loads(body_str)
            if isinstance(data, dict) and 'Message' in data and isinstance(data['Message'], str):
                try:
                    inner = json.loads(data['Message'])
                    if isinstance(inner, dict) and 'eventType' in inner:
                        data = inner
                except Exception:
                    # Not a nested JSON payload; keep original data
                    pass
        except Exception as exc:
            app.log.error(f"Failed to parse SQS record body as JSON: {exc}")
            continue

        # Validate and map to a typed model
        try:
            parsed = parse_sqs_message(data)
        except Exception as exc:
            app.log.error(f"Failed to parse message with schema: {exc}")
            continue

        # Route by event type
        if parsed.eventType == EventType.USER_REGISTERED:
            try:
                user = parsed.user
                # Compose a display name if available
                user_name = None
                if getattr(user, 'firstName', None) and getattr(user, 'lastName', None):
                    user_name = f"{user.firstName} {user.lastName}"
                elif getattr(user, 'firstName', None):
                    user_name = user.firstName
                elif getattr(user, 'lastName', None):
                    user_name = user.lastName

                role = None
                try:
                    role = user.role.value if user.role is not None else None
                except Exception:
                    role = str(user.role) if user.role is not None else None

                ok = _mailer.send_welcome_email(to=user.email, user_name=user_name, user_role=role)
                if ok:
                    app.log.info(f"Sent welcome email to {user.email}")
                else:
                    app.log.error(f"Failed to send welcome email to {user.email}")
            except Exception as exc:
                app.log.error(f"Error handling USER_REGISTERED: {exc}")

            try:
                from chalicelib.rapydmoney import create_rapydmoney_service

                user = parsed.user
                if user:
                    if user.email:
                        new_user = {
                            "id": user.id,
                            "email": user.email,
                            "firstName": user.firstName,
                            "lastName": user.lastName,
                        }
                        print("New User to add :  ", new_user)

                        rapyd = create_rapydmoney_service(
                            api_token=os.getenv("RAPYD_MONEY_API_TOKEN"),
                            base_url=os.getenv("RAPYD_MONEY_BASE_URL")
                        )
                        rapyd.create_user(
                            user_data=new_user,
                            timeout=60.0
                        )
                        rapyd.activate_pay(
                            user.id,
                            timeout=60.0
                        )
                        print("User added and activated :: ID: ", user.id)

            except Exception as exc:
                app.log.error(f"Error handling USER_REGISTERED - RapydMoney Registration: {exc}")



        elif parsed.eventType == EventType.STUDENT_MAGIC_LINK_REQUESTED:
            try:
                email = parsed.email
                token = parsed.magicToken
                link_url = getattr(parsed, 'linkUrl', None)
                ok = _mailer.send_magic_link_email(to=email, magic_token=token, link_url=link_url)
                if ok:
                    app.log.info(f"Sent magic link email to {email}")
                else:
                    app.log.error(f"Failed to send magic link email to {email}")
            except Exception as exc:
                app.log.error(f"Error handling STUDENT_MAGIC_LINK_REQUESTED: {exc}")

        else:
            app.log.warning(f"Unhandled eventType: {parsed.eventType}")
