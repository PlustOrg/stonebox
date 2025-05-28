import sys
import resource
import subprocess
import os

def set_limits_and_exec():
    memory_limit_mb_str = os.environ.get('STONEBOX_MEMORY_LIMIT_MB')
    process_limit_str = os.environ.get('STONEBOX_PROCESS_LIMIT')
    command_args_json = os.environ.get('STONEBOX_EXEC_ARGS') # JSON string of command and args

    if memory_limit_mb_str:
        try:
            memory_limit_bytes = int(memory_limit_mb_str) * 1024 * 1024
            resource.setrlimit(resource.RLIMIT_AS, (memory_limit_bytes, memory_limit_bytes))
        except Exception as e:
            print(f"Stonebox Unix Limiter: Failed to set memory limit: {e}", file=sys.stderr)

    if process_limit_str:
        try:
            process_limit = int(process_limit_str)
            resource.setrlimit(resource.RLIMIT_NPROC, (process_limit, process_limit))
        except Exception as e:
            print(f"Stonebox Unix Limiter: Failed to set process limit: {e}", file=sys.stderr)

    if not command_args_json:
        print("Stonebox Unix Limiter: STONEBOX_EXEC_ARGS not set.", file=sys.stderr)
        sys.exit(120)

    try:
        import json
        command_parts = json.loads(command_args_json)
    except Exception as e:
        print(f"Stonebox Unix Limiter: Failed to parse STONEBOX_EXEC_ARGS: {e}", file=sys.stderr)
        sys.exit(121)

    actual_command = command_parts[0]
    actual_args = command_parts

    if 'STONEBOX_MEMORY_LIMIT_MB' in os.environ: del os.environ['STONEBOX_MEMORY_LIMIT_MB']
    if 'STONEBOX_PROCESS_LIMIT' in os.environ: del os.environ['STONEBOX_PROCESS_LIMIT']
    if 'STONEBOX_EXEC_ARGS' in os.environ: del os.environ['STONEBOX_EXEC_ARGS']

    try:
        os.execvp(actual_command, actual_args)
    except FileNotFoundError:
        print(f"Stonebox Unix Limiter: Command not found: {actual_command}", file=sys.stderr)
        sys.exit(127)
    except Exception as e:
        print(f"Stonebox Unix Limiter: Failed to exec command {actual_command}: {e}", file=sys.stderr)
        sys.exit(126)

if __name__ == "__main__":
    set_limits_and_exec()
