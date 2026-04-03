import { Link, href } from "react-router";
import { Key } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "~app/components/ui/breadcrumb";

interface BreadcrumbsProps {
  vaultId: string;
  secretName?: string;
  secretId?: string;
  currentPage?: string;
}

export function Breadcrumbs({
  vaultId,
  secretName,
  secretId,
  currentPage,
}: BreadcrumbsProps) {
  return (
    <Breadcrumb className="mb-4">
      <BreadcrumbList>
        {/* Secret name link or page */}
        {secretName && secretId && (
          <>
            {currentPage ? (
              <>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link
                      to={href("/vault/:vaultId/passwords/:secretId", {
                        vaultId,
                        secretId,
                      })}
                      className="flex items-center gap-1.5"
                    >
                      <Key size={14} />
                      {secretName}
                    </Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
              </>
            ) : (
              <BreadcrumbItem>
                <BreadcrumbPage className="flex items-center gap-1.5">
                  <Key size={14} />
                  {secretName}
                </BreadcrumbPage>
              </BreadcrumbItem>
            )}
          </>
        )}

        {/* Current page */}
        {currentPage && (
          <BreadcrumbItem>
            <BreadcrumbPage>{currentPage}</BreadcrumbPage>
          </BreadcrumbItem>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
