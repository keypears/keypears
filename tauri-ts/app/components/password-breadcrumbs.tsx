import { Link, href } from "react-router";
import { Lock, Key } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "~app/components/ui/breadcrumb";

interface PasswordBreadcrumbsProps {
  vaultId: string;
  vaultName: string;
  vaultDomain: string;
  passwordName?: string;
  passwordSecretId?: string;
  currentPage?: string;
}

export function PasswordBreadcrumbs({
  vaultId,
  vaultName,
  vaultDomain,
  passwordName,
  passwordSecretId,
  currentPage,
}: PasswordBreadcrumbsProps) {
  return (
    <Breadcrumb className="mb-4">
      <BreadcrumbList>
        {/* Vault name link or page */}
        {!passwordName && !currentPage ? (
          <BreadcrumbItem>
            <BreadcrumbPage className="flex items-center gap-1.5">
              <Lock size={14} />
              {vaultName}@{vaultDomain}
            </BreadcrumbPage>
          </BreadcrumbItem>
        ) : (
          <>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link
                  to={href("/vault/:vaultId/secrets", { vaultId })}
                  className="flex items-center gap-1.5"
                >
                  <Lock size={14} />
                  {vaultName}@{vaultDomain}
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
          </>
        )}

        {/* Password name link or page */}
        {passwordName && passwordSecretId && (
          <>
            {currentPage ? (
              <>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link
                      to={href("/vault/:vaultId/secrets/:secretId", {
                        vaultId,
                        secretId: passwordSecretId,
                      })}
                      className="flex items-center gap-1.5"
                    >
                      <Key size={14} />
                      {passwordName}
                    </Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
              </>
            ) : (
              <BreadcrumbItem>
                <BreadcrumbPage className="flex items-center gap-1.5">
                  <Key size={14} />
                  {passwordName}
                </BreadcrumbPage>
              </BreadcrumbItem>
            )}
          </>
        )}

        {/* Current page (if provided) */}
        {currentPage && (
          <BreadcrumbItem>
            <BreadcrumbPage>{currentPage}</BreadcrumbPage>
          </BreadcrumbItem>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
